alter table public.payment_orders
  add column if not exists discount numeric not null default 0
    check (discount >= 0);

create or replace function public.finalize_razorpay_payment(
  p_payment_order_id uuid,
  p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_order public.payment_orders%rowtype;
  v_result jsonb;
  v_sale_id bigint;
begin
  select * into v_payment_order
  from public.payment_orders
  where id = p_payment_order_id
  for update;

  if not found then
    raise exception 'Payment order not found';
  end if;

  if v_payment_order.status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'already_paid', true,
      'sale_id', v_payment_order.sale_id,
      'payment_id', v_payment_order.razorpay_payment_id
    );
  end if;

  if v_payment_order.razorpay_order_id is null then
    raise exception 'Razorpay order ID is missing';
  end if;

  v_result := public.pos_checkout(
    v_payment_order.items,
    coalesce(v_payment_order.discount, 0),
    'card',
    v_payment_order.customer_name,
    v_payment_order.customer_phone,
    (v_payment_order.amount_paise::numeric / 100)
  );

  v_sale_id := nullif(v_result ->> 'sale_id', '')::bigint;
  if v_sale_id is null then
    raise exception 'POS checkout returned no sale ID';
  end if;

  update public.sales
  set payment_method = 'razorpay'
  where id = v_sale_id;

  update public.payment_orders
  set
    status = 'paid',
    razorpay_payment_id = p_payment_id,
    sale_id = v_sale_id,
    paid_at = now(),
    updated_at = now()
  where id = p_payment_order_id;

  return v_result || jsonb_build_object(
    'payment_id', p_payment_id,
    'payment_order_id', p_payment_order_id
  );
end;
$$;

revoke execute on function public.finalize_razorpay_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_razorpay_payment(uuid, text) to service_role;
