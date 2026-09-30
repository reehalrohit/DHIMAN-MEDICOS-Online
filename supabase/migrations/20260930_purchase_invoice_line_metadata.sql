-- Preserve complete purchase-invoice line metadata and snapshot it into sale items.
-- Missing values remain NULL/empty; the importer also keeps raw_row for fields not
-- explicitly mapped below, so invoice data is never silently discarded.

CREATE TABLE IF NOT EXISTS public.purchase_invoice_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_row_key text NOT NULL UNIQUE,
  file_sha256 text,
  invoice_file text,
  row_number integer,

  supplier_name text,
  supplier_gstin text,
  supplier_address text,
  supplier_state text,
  supplier_state_code text,
  buyer_gstin text,
  buyer_address text,
  buyer_state text,
  buyer_state_code text,

  invoice_no text,
  invoice_date date,
  company text,
  item_code text,
  barcode text,
  item_name text,
  medicine_id text,
  pack text,
  batch_no text,
  expiry text,
  expiry_date date,

  qty numeric,
  free_qty numeric,
  half_pack numeric,
  purchase_rate numeric,
  sale_rate numeric,
  discount numeric,
  mrp numeric,
  net_rate numeric,

  excise numeric,
  vat numeric,
  additional_vat numeric,
  line_amount numeric,
  local_cent text,
  scheme1 numeric,
  scheme2 numeric,
  scheme_percent numeric,

  customer_code text,
  invoice_day numeric,
  invoice_month numeric,
  invoice_year numeric,
  expiry_day numeric,
  expiry_month numeric,
  expiry_year numeric,
  supplier_code text,
  invoice_amount numeric,

  cgst_rate numeric,
  sgst_rate numeric,
  igst_rate numeric,
  gst_rate numeric,
  hsn_code text,
  cgst_amount numeric,
  sgst_amount numeric,
  igst_amount numeric,
  gst_amount numeric,

  expiry_display text,
  customer_order_no text,
  purchase_serial_no text,
  tcs_percent numeric,
  tcs_amount numeric,

  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_invoice_lines_medicine_idx
  ON public.purchase_invoice_lines (medicine_id);
CREATE INDEX IF NOT EXISTS purchase_invoice_lines_batch_idx
  ON public.purchase_invoice_lines (medicine_id, batch_no, expiry);
CREATE INDEX IF NOT EXISTS purchase_invoice_lines_invoice_idx
  ON public.purchase_invoice_lines (invoice_no, invoice_date);
CREATE INDEX IF NOT EXISTS purchase_invoice_lines_file_idx
  ON public.purchase_invoice_lines (invoice_file);

ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_invoice_lines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_invoice_lines TO service_role;

-- Batch metadata is the source snapshot used when an item is sold.
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS purchase_invoice_line_id bigint,
  ADD COLUMN IF NOT EXISTS source_row_key text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS pack text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric,
  ADD COLUMN IF NOT EXISTS igst_rate numeric,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric,
  ADD COLUMN IF NOT EXISTS igst_amount numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS sale_rate numeric,
  ADD COLUMN IF NOT EXISTS discount_percent numeric,
  ADD COLUMN IF NOT EXISTS free_quantity numeric,
  ADD COLUMN IF NOT EXISTS scheme1 numeric,
  ADD COLUMN IF NOT EXISTS scheme2 numeric,
  ADD COLUMN IF NOT EXISTS scheme_percent numeric,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_gstin text,
  ADD COLUMN IF NOT EXISTS purchase_invoice_no text,
  ADD COLUMN IF NOT EXISTS purchase_invoice_date date,
  ADD COLUMN IF NOT EXISTS supplier_code text,
  ADD COLUMN IF NOT EXISTS customer_order_no text,
  ADD COLUMN IF NOT EXISTS purchase_serial_no text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_batches_purchase_invoice_line_fk'
      AND conrelid = 'public.inventory_batches'::regclass
  ) THEN
    ALTER TABLE public.inventory_batches
      ADD CONSTRAINT inventory_batches_purchase_invoice_line_fk
      FOREIGN KEY (purchase_invoice_line_id)
      REFERENCES public.purchase_invoice_lines(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS inventory_batches_source_row_key_idx
  ON public.inventory_batches (source_row_key);
CREATE INDEX IF NOT EXISTS inventory_batches_purchase_invoice_line_idx
  ON public.inventory_batches (purchase_invoice_line_id);

-- Sale items store a historical snapshot. This protects old invoices from later
-- edits to the inventory/batch master record.
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS source_row_key text,
  ADD COLUMN IF NOT EXISTS purchase_invoice_line_id bigint,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS pack text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS schedule text,
  ADD COLUMN IF NOT EXISTS rack text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric,
  ADD COLUMN IF NOT EXISTS igst_rate numeric,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric,
  ADD COLUMN IF NOT EXISTS igst_amount numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS purchase_invoice_no text,
  ADD COLUMN IF NOT EXISTS purchase_invoice_date date,
  ADD COLUMN IF NOT EXISTS supplier_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_items_purchase_invoice_line_fk'
      AND conrelid = 'public.sale_items'::regclass
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_purchase_invoice_line_fk
      FOREIGN KEY (purchase_invoice_line_id)
      REFERENCES public.purchase_invoice_lines(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS sale_items_source_row_key_idx
  ON public.sale_items (source_row_key);
CREATE INDEX IF NOT EXISTS sale_items_purchase_invoice_line_idx
  ON public.sale_items (purchase_invoice_line_id);

CREATE OR REPLACE FUNCTION public.snapshot_sale_item_batch_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.inventory_batches%ROWTYPE;
  v_schedule text;
BEGIN
  IF NEW.batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO b
  FROM public.inventory_batches
  WHERE id = NEW.batch_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT m.schedule
    INTO v_schedule
  FROM public.medicine_regulatory_classification m
  WHERE m.medicine_id = NEW.medicine_id;

  NEW.source_row_key := COALESCE(NEW.source_row_key, b.source_row_key);
  NEW.purchase_invoice_line_id := COALESCE(NEW.purchase_invoice_line_id, b.purchase_invoice_line_id);
  NEW.barcode := COALESCE(NULLIF(NEW.barcode, ''), b.barcode);
  NEW.pack := COALESCE(NULLIF(NEW.pack, ''), b.pack);
  NEW.company := COALESCE(NULLIF(NEW.company, ''), b.company);
  NEW.schedule := COALESCE(NULLIF(NEW.schedule, ''), v_schedule);
  NEW.rack := COALESCE(NULLIF(NEW.rack, ''), NULL);
  NEW.hsn_code := COALESCE(NULLIF(NEW.hsn_code, ''), b.hsn_code);
  NEW.gst_rate := COALESCE(NEW.gst_rate, b.gst_rate);
  NEW.cgst_rate := COALESCE(NEW.cgst_rate, b.cgst_rate);
  NEW.sgst_rate := COALESCE(NEW.sgst_rate, b.sgst_rate);
  NEW.igst_rate := COALESCE(NEW.igst_rate, b.igst_rate);
  NEW.cgst_amount := COALESCE(NEW.cgst_amount, b.cgst_amount);
  NEW.sgst_amount := COALESCE(NEW.sgst_amount, b.sgst_amount);
  NEW.igst_amount := COALESCE(NEW.igst_amount, b.igst_amount);
  NEW.gst_amount := COALESCE(NEW.gst_amount, b.gst_amount);
  NEW.purchase_invoice_no := COALESCE(NULLIF(NEW.purchase_invoice_no, ''), b.purchase_invoice_no);
  NEW.purchase_invoice_date := COALESCE(NEW.purchase_invoice_date, b.purchase_invoice_date);
  NEW.supplier_name := COALESCE(NULLIF(NEW.supplier_name, ''), b.supplier_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_items_snapshot_batch_metadata ON public.sale_items;
CREATE TRIGGER sale_items_snapshot_batch_metadata
BEFORE INSERT OR UPDATE OF batch_id
ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_sale_item_batch_metadata();


-- Atomic stock-import wrapper that attaches the exact source purchase-invoice line
-- to the resulting inventory batch without changing the established stock logic.
CREATE OR REPLACE FUNCTION public.apply_invoice_purchase_with_metadata(
  p_medicine_id text,
  p_medicine_name text,
  p_batch_no text,
  p_expiry text,
  p_mrp numeric,
  p_purchase_price numeric,
  p_quantity integer,
  p_reference text,
  p_source_key text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_batch_id bigint;
  v_source_row_key text;
BEGIN
  v_result := public.apply_invoice_purchase(
    p_medicine_id,
    p_medicine_name,
    p_batch_no,
    p_expiry,
    p_mrp,
    p_purchase_price,
    p_quantity,
    p_reference,
    p_source_key
  );

  v_batch_id := NULLIF(v_result ->> 'batch_id', '')::bigint;
  v_source_row_key := NULLIF(p_metadata ->> 'source_row_key', '');

  IF v_batch_id IS NULL THEN
    SELECT b.id
      INTO v_batch_id
    FROM public.inventory_batches b
    WHERE b.medicine_id = p_medicine_id
      AND b.batch_no = p_batch_no
      AND COALESCE(b.expiry, '') = COALESCE(NULLIF(p_expiry, ''), '')
    ORDER BY b.id DESC
    LIMIT 1;
  END IF;

  IF v_batch_id IS NOT NULL AND p_metadata IS NOT NULL THEN
    UPDATE public.inventory_batches b
    SET
      purchase_invoice_line_id = COALESCE(NULLIF(p_metadata ->> 'id', '')::bigint, b.purchase_invoice_line_id),
      source_row_key = COALESCE(v_source_row_key, b.source_row_key),
      barcode = COALESCE(NULLIF(p_metadata ->> 'barcode', ''), b.barcode),
      pack = COALESCE(NULLIF(p_metadata ->> 'pack', ''), b.pack),
      company = COALESCE(NULLIF(p_metadata ->> 'company', ''), b.company),
      item_code = COALESCE(NULLIF(p_metadata ->> 'item_code', ''), b.item_code),
      hsn_code = COALESCE(NULLIF(p_metadata ->> 'hsn_code', ''), b.hsn_code),
      cgst_rate = COALESCE(NULLIF(p_metadata ->> 'cgst_rate', '')::numeric, b.cgst_rate),
      sgst_rate = COALESCE(NULLIF(p_metadata ->> 'sgst_rate', '')::numeric, b.sgst_rate),
      igst_rate = COALESCE(NULLIF(p_metadata ->> 'igst_rate', '')::numeric, b.igst_rate),
      gst_rate = COALESCE(NULLIF(p_metadata ->> 'gst_rate', '')::numeric, b.gst_rate),
      cgst_amount = COALESCE(NULLIF(p_metadata ->> 'cgst_amount', '')::numeric, b.cgst_amount),
      sgst_amount = COALESCE(NULLIF(p_metadata ->> 'sgst_amount', '')::numeric, b.sgst_amount),
      igst_amount = COALESCE(NULLIF(p_metadata ->> 'igst_amount', '')::numeric, b.igst_amount),
      gst_amount = COALESCE(NULLIF(p_metadata ->> 'gst_amount', '')::numeric, b.gst_amount),
      sale_rate = COALESCE(NULLIF(p_metadata ->> 'sale_rate', '')::numeric, b.sale_rate),
      discount_percent = COALESCE(NULLIF(p_metadata ->> 'discount', '')::numeric, b.discount_percent),
      free_quantity = COALESCE(NULLIF(p_metadata ->> 'free_qty', '')::numeric, b.free_quantity),
      scheme1 = COALESCE(NULLIF(p_metadata ->> 'scheme1', '')::numeric, b.scheme1),
      scheme2 = COALESCE(NULLIF(p_metadata ->> 'scheme2', '')::numeric, b.scheme2),
      scheme_percent = COALESCE(NULLIF(p_metadata ->> 'scheme_percent', '')::numeric, b.scheme_percent),
      supplier_name = COALESCE(NULLIF(p_metadata ->> 'supplier_name', ''), b.supplier_name),
      supplier_gstin = COALESCE(NULLIF(p_metadata ->> 'supplier_gstin', ''), b.supplier_gstin),
      supplier_code = COALESCE(NULLIF(p_metadata ->> 'supplier_code', ''), b.supplier_code),
      purchase_invoice_no = COALESCE(NULLIF(p_metadata ->> 'invoice_no', ''), b.purchase_invoice_no),
      purchase_invoice_date = COALESCE(NULLIF(p_metadata ->> 'invoice_date', '')::date, b.purchase_invoice_date),
      customer_order_no = COALESCE(NULLIF(p_metadata ->> 'customer_order_no', ''), b.customer_order_no),
      purchase_serial_no = COALESCE(NULLIF(p_metadata ->> 'purchase_serial_no', ''), b.purchase_serial_no),
      source_invoice = COALESCE(NULLIF(p_metadata ->> 'invoice_file', ''), b.source_invoice),
      source_invoice_date = COALESCE(NULLIF(p_metadata ->> 'invoice_date', '')::date, b.source_invoice_date),
      source_purchase_rate = COALESCE(NULLIF(p_metadata ->> 'purchase_rate', '')::numeric, b.source_purchase_rate),
      cost_source = COALESCE('purchase_invoice', b.cost_source),
      updated_at = now()
    WHERE b.id = v_batch_id;
  END IF;

  RETURN v_result || jsonb_build_object('metadata_attached', v_batch_id IS NOT NULL, 'batch_id', v_batch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_invoice_purchase_with_metadata(
  text, text, text, text, numeric, numeric, integer, text, text, jsonb
) TO service_role;

-- Attach captured metadata to matching batches. This is used for both new invoice
-- imports and historical invoice re-scans; it does not change stock quantities.
CREATE OR REPLACE FUNCTION public.sync_purchase_invoice_metadata(p_source_row_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_source_row_keys IS NULL OR cardinality(p_source_row_keys) = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated_batches', 0);
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (pil.medicine_id, pil.batch_no, COALESCE(pil.expiry, ''))
      pil.*
    FROM public.purchase_invoice_lines pil
    WHERE pil.source_row_key = ANY (p_source_row_keys)
      AND pil.medicine_id IS NOT NULL
      AND pil.batch_no IS NOT NULL
    ORDER BY pil.medicine_id, pil.batch_no, COALESCE(pil.expiry, ''), pil.id DESC
  )
  UPDATE public.inventory_batches b
  SET
    purchase_invoice_line_id = c.id,
    source_row_key = c.source_row_key,
    barcode = COALESCE(c.barcode, b.barcode),
    pack = COALESCE(c.pack, b.pack),
    company = COALESCE(c.company, b.company),
    item_code = COALESCE(c.item_code, b.item_code),
    hsn_code = COALESCE(c.hsn_code, b.hsn_code),
    cgst_rate = COALESCE(c.cgst_rate, b.cgst_rate),
    sgst_rate = COALESCE(c.sgst_rate, b.sgst_rate),
    igst_rate = COALESCE(c.igst_rate, b.igst_rate),
    gst_rate = COALESCE(c.gst_rate, b.gst_rate),
    cgst_amount = COALESCE(c.cgst_amount, b.cgst_amount),
    sgst_amount = COALESCE(c.sgst_amount, b.sgst_amount),
    igst_amount = COALESCE(c.igst_amount, b.igst_amount),
    gst_amount = COALESCE(c.gst_amount, b.gst_amount),
    sale_rate = COALESCE(c.sale_rate, b.sale_rate),
    discount_percent = COALESCE(c.discount, b.discount_percent),
    free_quantity = COALESCE(c.free_qty, b.free_quantity),
    scheme1 = COALESCE(c.scheme1, b.scheme1),
    scheme2 = COALESCE(c.scheme2, b.scheme2),
    scheme_percent = COALESCE(c.scheme_percent, b.scheme_percent),
    supplier_name = COALESCE(c.supplier_name, b.supplier_name),
    supplier_gstin = COALESCE(c.supplier_gstin, b.supplier_gstin),
    purchase_invoice_no = COALESCE(c.invoice_no, b.purchase_invoice_no),
    purchase_invoice_date = COALESCE(c.invoice_date, b.purchase_invoice_date),
    supplier_code = COALESCE(c.supplier_code, b.supplier_code),
    customer_order_no = COALESCE(c.customer_order_no, b.customer_order_no),
    purchase_serial_no = COALESCE(c.purchase_serial_no, b.purchase_serial_no),
    updated_at = now()
  FROM candidates c
  WHERE b.medicine_id = c.medicine_id
    AND b.batch_no = c.batch_no
    AND COALESCE(b.expiry, '') = COALESCE(c.expiry, '');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_batches', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_purchase_invoice_metadata(text[]) TO service_role;
