-- ============================================================
-- DHIMAN MEDICOS
-- Normalize existing inventory for online-store availability
--
-- Rules:
-- 1. Existing non-expired stock with quantity 1–4 becomes 5.
-- 2. Existing non-expired stock already >= 5 is unchanged.
-- 3. Expired stock becomes 0.
-- 4. Do NOT create fake batches for medicines with no inventory.
-- 5. Do NOT modify batch number, expiry date, MRP or medicine ID.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Expired inventory must never remain sellable.
-- ------------------------------------------------------------

update public.inventory_batches
set
  quantity = 0,
  updated_at = now()
where expiry_date < current_date
  and quantity <> 0;


-- ------------------------------------------------------------
-- 2. Bring every existing non-expired batch to minimum 5.
-- ------------------------------------------------------------

update public.inventory_batches
set
  quantity = 5,
  updated_at = now()
where expiry_date >= current_date
  and quantity > 0
  and quantity < 5;


-- ------------------------------------------------------------
-- 3. Safety: NULL expiry dates are treated as non-expired
--    only when they already have positive stock.
--
--    Bring positive quantities below 5 up to 5.
-- ------------------------------------------------------------

update public.inventory_batches
set
  quantity = 5,
  updated_at = now()
where expiry_date is null
  and quantity > 0
  and quantity < 5;


-- ------------------------------------------------------------
-- 4. Verification
-- ------------------------------------------------------------

do $$
declare
  bad_count integer;
begin

  select count(*)
  into bad_count
  from public.inventory_batches
  where expiry_date < current_date
    and quantity > 0;

  if bad_count > 0 then
    raise exception
      'Inventory safety check failed: % expired batches still have stock.',
      bad_count;
  end if;

  select count(*)
  into bad_count
  from public.inventory_batches
  where expiry_date >= current_date
    and quantity between 1 and 4;

  if bad_count > 0 then
    raise exception
      'Inventory normalization failed: % non-expired batches still have quantity 1-4.',
      bad_count;
  end if;

end $$;

commit;
