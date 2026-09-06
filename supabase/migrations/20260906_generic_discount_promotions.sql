-- Generic-only discounts and first-order coupon support.

create table if not exists public.medicine_offer_rules (
  medicine_id text primary key,
  is_generic boolean not null default false,
  discount_type text not null default 'percent'
    check (discount_type in ('percent','flat')),
  discount_value numeric(10,2) not null default 0
    check (discount_value >= 0),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    discount_type <> 'percent'
    or discount_value <= 100
  )
);

create index if not exists medicine_offer_rules_active_idx
  on public.medicine_offer_rules(active);

alter table public.medicine_offer_rules enable row level security;
revoke all on public.medicine_offer_rules from anon, authenticated, public;
grant select, insert, update, delete on public.medicine_offer_rules to service_role;

create table if not exists public.promotion_codes (
  code text primary key,
  discount_type text not null
    check (discount_type in ('percent','flat')),
  discount_value numeric(10,2) not null
    check (discount_value >= 0),
  minimum_order numeric(12,2) not null default 0
    check (minimum_order >= 0),
  maximum_discount numeric(12,2),
  first_order_only boolean not null default false,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  per_customer_limit integer,
  total_usage_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    discount_type <> 'percent'
    or discount_value <= 100
  ),
  check (
    maximum_discount is null
    or maximum_discount >= 0
  ),
  check (
    per_customer_limit is null
    or per_customer_limit > 0
  ),
  check (
    total_usage_limit is null
    or total_usage_limit > 0
  )
);

create index if not exists promotion_codes_active_idx
  on public.promotion_codes(active);

alter table public.promotion_codes enable row level security;
revoke all on public.promotion_codes from anon, authenticated, public;
grant select, insert, update, delete on public.promotion_codes to service_role;

create table if not exists public.promotion_redemptions (
  id bigint generated always as identity primary key,
  code text not null references public.promotion_codes(code) on update cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_order_id uuid references public.customer_orders(id) on delete set null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemptions_code_idx
  on public.promotion_redemptions(code);

create index if not exists promotion_redemptions_user_idx
  on public.promotion_redemptions(user_id);

alter table public.promotion_redemptions enable row level security;
revoke all on public.promotion_redemptions from anon, authenticated, public;
grant select, insert, update, delete on public.promotion_redemptions to service_role;

insert into public.promotion_codes (
  code, discount_type, discount_value, minimum_order,
  maximum_discount, first_order_only, active
)
values (
  'WELCOME50', 'flat', 50, 499, 50, true, true
)
on conflict (code) do update
set
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  minimum_order = excluded.minimum_order,
  maximum_discount = excluded.maximum_discount,
  first_order_only = excluded.first_order_only,
  active = excluded.active,
  updated_at = now();

create or replace function public.set_medicine_offer_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists medicine_offer_rules_updated_at
on public.medicine_offer_rules;

create trigger medicine_offer_rules_updated_at
before update on public.medicine_offer_rules
for each row execute function public.set_medicine_offer_updated_at();

create or replace function public.set_promotion_code_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists promotion_codes_updated_at
on public.promotion_codes;

create trigger promotion_codes_updated_at
before update on public.promotion_codes
for each row execute function public.set_promotion_code_updated_at();
