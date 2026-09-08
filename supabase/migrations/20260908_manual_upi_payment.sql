-- Add manual UPI payment support to online orders.
-- Run after 20260904_add_customer_online_orders.sql.

alter table public.customer_orders drop constraint if exists customer_orders_payment_method_check;
alter table public.customer_orders add constraint customer_orders_payment_method_check check (payment_method in ('cod','razorpay','upi_manual'));

create or replace function public.confirm_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_items jsonb;
  v_result jsonb;
  v_sale_id bigint;
begin
  select * into v_order from public.customer_orders where id = p_order_id for update;
  if not found then raise exception 'Online order not found'; end if;
  if v_order.sale_id is not null then
    return jsonb_build_object('success', true, 'already_confirmed', true, 'sale_id', v_order.sale_id, 'order_id', v_order.id, 'order_status', v_order.order_status);
  end if;
  if v_order.payment_method in ('razorpay','upi_manual') and v_order.payment_status <> 'paid' then raise exception 'Online payment is not confirmed yet'; end if;
  if v_order.prescription_status = 'pending' then raise exception 'Prescription must be approved before confirmation'; end if;
  if v_order.prescription_status = 'rejected' then raise exception 'Order prescription was rejected'; end if;
  if v_order.order_status in ('cancelled','rejected','delivered') then raise exception 'Order cannot be confirmed from its current status'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('medicine_id', medicine_id, 'quantity', quantity, 'unit_price', unit_price) order by id), '[]'::jsonb)
  into v_items from public.customer_order_items where order_id = v_order.id;
  if jsonb_array_length(v_items) = 0 then raise exception 'Online order has no items'; end if;
  v_result := public.pos_checkout(v_items, coalesce(v_order.discount, 0), case when v_order.payment_method in ('razorpay','upi_manual') then 'card' else 'cash' end, v_order.customer_name, v_order.customer_phone, case when v_order.payment_status = 'paid' then v_order.total else 0 end);
  v_sale_id := nullif(v_result->>'sale_id','')::bigint;
  if v_sale_id is null then raise exception 'POS checkout returned no sale ID'; end if;
  update public.customer_orders set sale_id = v_sale_id, order_status = 'confirmed', updated_at = now() where id = v_order.id;
  insert into public.customer_order_events(order_id,status,note) values(v_order.id,'confirmed','Order confirmed by pharmacy; POS sale ' || v_sale_id || ' created.');
  return v_result || jsonb_build_object('success', true, 'order_id', v_order.id, 'sale_id', v_sale_id);
end;
$$;

revoke execute on function public.confirm_customer_order(uuid) from public, anon, authenticated;
grant execute on function public.confirm_customer_order(uuid) to service_role;
