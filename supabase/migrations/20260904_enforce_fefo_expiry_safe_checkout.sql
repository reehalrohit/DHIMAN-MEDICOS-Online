-- Phase 2: expiry-safe pharmacy checkout.
-- FEFO = First Expiry, First Out. Expired batches are never sold.

CREATE OR REPLACE FUNCTION public.pos_checkout(
    p_items jsonb,
    p_discount numeric DEFAULT 0,
    p_payment_method text DEFAULT 'cash',
    p_customer_name text DEFAULT NULL,
    p_customer_phone text DEFAULT NULL,
    p_amount_paid numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    v_sale_id bigint;
    v_invoice_number text;

    v_subtotal numeric := 0;
    v_total numeric := 0;
    v_amount_paid numeric := 0;
    v_balance numeric := 0;

    v_item jsonb;

    v_inventory_id bigint;
    v_batch_id bigint;

    v_medicine_id text;
    v_medicine_name text;
    v_batch_no text;
    v_expiry_text text;
    v_expiry_date date;

    v_quantity integer;
    v_available integer;

    v_mrp numeric;
    v_unit_price numeric;
    v_line_total numeric;

begin
    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'Cart is empty';
    end if;

    if coalesce(p_discount, 0) < 0 then
        raise exception 'Discount cannot be negative';
    end if;

    if p_payment_method not in ('cash', 'upi', 'card', 'credit', 'mixed') then
        raise exception 'Invalid payment method';
    end if;

    -- First pass: calculate subtotal from the submitted unit prices.
    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_quantity := (v_item ->> 'quantity')::integer;
        v_unit_price := (v_item ->> 'unit_price')::numeric;

        if v_quantity <= 0 then
            raise exception 'Quantity must be greater than zero';
        end if;

        if v_unit_price < 0 then
            raise exception 'Unit price cannot be negative';
        end if;

        v_subtotal := v_subtotal + (v_quantity * v_unit_price);
    end loop;

    v_total := greatest(0, v_subtotal - coalesce(p_discount, 0));
    v_amount_paid := coalesce(p_amount_paid, v_total);

    if v_amount_paid < 0 then
        raise exception 'Amount paid cannot be negative';
    end if;

    v_balance := v_total - v_amount_paid;

    v_invoice_number :=
        'DM-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS');

    insert into public.sales (
        invoice_number,
        subtotal,
        discount,
        total,
        payment_method,
        customer_name,
        customer_phone,
        amount_paid,
        balance,
        status
    )
    values (
        v_invoice_number,
        v_subtotal,
        coalesce(p_discount, 0),
        v_total,
        p_payment_method,
        nullif(trim(p_customer_name), ''),
        nullif(trim(p_customer_phone), ''),
        v_amount_paid,
        v_balance,
        'completed'
    )
    returning id into v_sale_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_medicine_id := nullif(trim(v_item ->> 'medicine_id'), '');
        v_quantity := (v_item ->> 'quantity')::integer;
        v_unit_price := (v_item ->> 'unit_price')::numeric;

        select i.id, i.medicine_name
        into v_inventory_id, v_medicine_name
        from public.inventory i
        where i.medicine_id = v_medicine_id
        for update;

        if not found then
            raise exception 'Medicine not found: %', v_medicine_id;
        end if;

        v_batch_id := nullif(v_item ->> 'batch_id', '')::bigint;

        if v_batch_id is not null then
            select b.batch_no, b.expiry, b.mrp, b.quantity
            into v_batch_no, v_expiry_text, v_mrp, v_available
            from public.inventory_batches b
            where b.id = v_batch_id
              and b.medicine_id = v_medicine_id
            for update;
        else
            -- FEFO: earliest valid expiry first. Missing/invalid expiry is last.
            select b.id, b.batch_no, b.expiry, b.mrp, b.quantity
            into v_batch_id, v_batch_no, v_expiry_text, v_mrp, v_available
            from public.inventory_batches b
            where b.medicine_id = v_medicine_id
              and b.quantity > 0
              and (
                b.expiry is null
                or b.expiry = ''
                or (
                  b.expiry ~ '^\\d{2}-\\d{2}-\\d{2}$'
                  and to_date(b.expiry, 'DD-MM-YY') >= current_date
                )
                or (
                  b.expiry ~ '^\\d{2}-\\d{2}-\\d{4}$'
                  and to_date(b.expiry, 'DD-MM-YYYY') >= current_date
                )
                or (
                  b.expiry ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  and to_date(b.expiry, 'YYYY-MM-DD') >= current_date
                )
              )
            order by
                case
                    when b.expiry ~ '^\\d{2}-\\d{2}-\\d{2}$'
                        then to_date(b.expiry, 'DD-MM-YY')
                    when b.expiry ~ '^\\d{2}-\\d{2}-\\d{4}$'
                        then to_date(b.expiry, 'DD-MM-YYYY')
                    when b.expiry ~ '^\\d{4}-\\d{2}-\\d{2}$'
                        then to_date(b.expiry, 'YYYY-MM-DD')
                    else date '9999-12-31'
                end asc,
                b.id asc
            limit 1
            for update;
        end if;

        if not found then
            raise exception 'No non-expired batch available for %', v_medicine_name;
        end if;

        -- Explicitly selected batches must also pass the expiry check.
        if v_expiry_text is not null and trim(v_expiry_text) <> '' then
            begin
                if v_expiry_text ~ '^\\d{2}-\\d{2}-\\d{2}$' then
                    v_expiry_date := to_date(v_expiry_text, 'DD-MM-YY');
                elsif v_expiry_text ~ '^\\d{2}-\\d{2}-\\d{4}$' then
                    v_expiry_date := to_date(v_expiry_text, 'DD-MM-YYYY');
                elsif v_expiry_text ~ '^\\d{4}-\\d{2}-\\d{2}$' then
                    v_expiry_date := v_expiry_text::date;
                else
                    v_expiry_date := null;
                end if;
            exception when others then
                v_expiry_date := null;
            end;

            if v_expiry_date is not null and v_expiry_date < current_date then
                raise exception
                    'Expired batch cannot be sold: % batch % expired on %',
                    v_medicine_name,
                    coalesce(v_batch_no, 'N/A'),
                    v_expiry_date;
            end if;
        else
            v_expiry_date := null;
        end if;

        if v_available < v_quantity then
            raise exception
                'Insufficient stock for % batch %. Available: %, requested: %',
                v_medicine_name,
                v_batch_no,
                v_available,
                v_quantity;
        end if;

        v_line_total := v_quantity * v_unit_price;

        insert into public.sale_items (
            sale_id,
            inventory_id,
            medicine_id,
            medicine_name,
            quantity,
            unit_price,
            total,
            batch_id,
            batch_no,
            expiry_date,
            mrp,
            discount
        )
        values (
            v_sale_id,
            v_inventory_id,
            v_medicine_id,
            v_medicine_name,
            v_quantity,
            v_unit_price,
            v_line_total,
            v_batch_id,
            v_batch_no,
            v_expiry_date,
            v_mrp,
            0
        );

        update public.inventory_batches
        set quantity = quantity - v_quantity,
            updated_at = now()
        where id = v_batch_id;

        update public.inventory
        set quantity = quantity - v_quantity,
            updated_at = now(),
            status = case
                when quantity - v_quantity <= 0 then 'out_of_stock'
                when quantity - v_quantity <= coalesce(low_stock_at, 5) then 'low_stock'
                else 'in_stock'
            end
        where id = v_inventory_id
          and quantity >= v_quantity;

        if not found then
            raise exception 'Insufficient total inventory for %', v_medicine_name;
        end if;

        insert into public.stock_movements (
            inventory_id,
            medicine_id,
            medicine_name,
            movement_type,
            quantity,
            reference_id,
            note
        )
        values (
            v_inventory_id,
            v_medicine_id,
            v_medicine_name,
            'sale',
            -v_quantity,
            v_sale_id,
            'POS sale ' || v_invoice_number || ' | Batch: ' || coalesce(v_batch_no, 'N/A')
        );
    end loop;

    return jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'discount', coalesce(p_discount, 0),
        'total', v_total,
        'amount_paid', v_amount_paid,
        'balance', v_balance,
        'payment_method', p_payment_method
    );
end;
$function$;
