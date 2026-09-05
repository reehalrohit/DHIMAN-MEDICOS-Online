alter table public.customer_orders
  add column if not exists rejection_reason text;

alter table public.customer_orders
  drop constraint if exists customer_orders_rejection_reason_length;

alter table public.customer_orders
  add constraint customer_orders_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) between 1 and 1000);
