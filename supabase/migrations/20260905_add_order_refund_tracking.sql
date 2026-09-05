alter table public.customer_orders add column if not exists refund_id text;
alter table public.customer_orders add column if not exists refund_status text check (refund_status is null or refund_status in ('created','processed','pending','failed'));
create index if not exists customer_orders_refund_id_idx on public.customer_orders(refund_id);
