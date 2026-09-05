alter table public.customer_orders
  add column if not exists delivery_latitude numeric(10,7),
  add column if not exists delivery_longitude numeric(10,7);

alter table public.customer_orders
  add constraint customer_orders_delivery_latitude_range
  check (delivery_latitude is null or delivery_latitude between -90 and 90);

alter table public.customer_orders
  add constraint customer_orders_delivery_longitude_range
  check (delivery_longitude is null or delivery_longitude between -180 and 180);

create index if not exists customer_orders_delivery_location_idx
  on public.customer_orders(delivery_latitude, delivery_longitude);
