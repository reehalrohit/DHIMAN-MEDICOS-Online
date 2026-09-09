-- Customer profile/order ownership hardening.
-- Existing orders remain intact. customer_id stays nullable so historical
-- orders that cannot be safely mapped are preserved.

alter table public.customer_orders
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_orders_customer_id_fkey'
  ) then
    alter table public.customer_orders
      add constraint customer_orders_customer_id_fkey
      foreign key (customer_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists customer_orders_customer_id_idx
  on public.customer_orders(customer_id, created_at desc);

-- Safely backfill only when the phone maps to exactly one customer profile.
update public.customer_orders o
set customer_id = p.id
from public.customer_profiles p
where o.customer_id is null
  and nullif(regexp_replace(o.customer_phone, '[^0-9]+', '', 'g'), '') =
      nullif(regexp_replace(p.phone, '[^0-9]+', '', 'g'), '')
  and (
    select count(*)
    from public.customer_profiles p2
    where nullif(regexp_replace(p2.phone, '[^0-9]+', '', 'g'), '') =
          nullif(regexp_replace(o.customer_phone, '[^0-9]+', '', 'g'), '')
  ) = 1;

alter table public.customer_profiles enable row level security;

drop policy if exists "customers can read own profile"
  on public.customer_profiles;

create policy "customers can read own profile"
on public.customer_profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "customers can insert own profile"
  on public.customer_profiles;

create policy "customers can insert own profile"
on public.customer_profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "customers can update own profile"
  on public.customer_profiles;

create policy "customers can update own profile"
on public.customer_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

alter table public.customer_orders enable row level security;

drop policy if exists "customers can read own orders"
  on public.customer_orders;

create policy "customers can read own orders"
on public.customer_orders
for select
to authenticated
using (customer_id = auth.uid());

revoke all on public.customer_orders from anon, authenticated;
revoke all on public.customer_order_items from anon, authenticated;
revoke all on public.customer_order_events from anon, authenticated;

grant select on public.customer_orders to authenticated;

-- Service-role/API paths continue to work because service_role bypasses RLS.
