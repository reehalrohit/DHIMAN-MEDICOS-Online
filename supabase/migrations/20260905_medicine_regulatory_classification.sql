create table if not exists public.medicine_regulatory_classification (
  medicine_id text primary key,
  schedule text check (schedule is null or schedule in ('H','H1')),
  nrx boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists medicine_regulatory_schedule_idx
on public.medicine_regulatory_classification(schedule);

create index if not exists medicine_regulatory_nrx_idx
on public.medicine_regulatory_classification(nrx);

alter table public.medicine_regulatory_classification enable row level security;
revoke all on public.medicine_regulatory_classification from anon, authenticated, public;
grant select, insert, update, delete on public.medicine_regulatory_classification to service_role;

create or replace function public.set_medicine_regulatory_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists medicine_regulatory_updated_at
on public.medicine_regulatory_classification;

create trigger medicine_regulatory_updated_at
before update on public.medicine_regulatory_classification
for each row execute function public.set_medicine_regulatory_updated_at();
