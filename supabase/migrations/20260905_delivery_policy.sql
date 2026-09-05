alter table public.customer_orders
add column if not exists delivery_distance_km numeric(8,3)
check (delivery_distance_km is null or (delivery_distance_km >= 0 and delivery_distance_km <= 100));

create index if not exists customer_orders_delivery_distance_idx
on public.customer_orders(delivery_distance_km);
