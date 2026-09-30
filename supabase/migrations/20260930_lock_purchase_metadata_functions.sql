-- Purchase-invoice metadata functions are backend import helpers only.
REVOKE ALL ON FUNCTION public.apply_invoice_purchase_with_metadata(text, text, text, text, numeric, numeric, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_purchase_with_metadata(text, text, text, text, numeric, numeric, integer, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.sync_purchase_invoice_metadata(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_purchase_invoice_metadata(text[]) TO service_role;

REVOKE ALL ON FUNCTION public.snapshot_sale_item_batch_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_sale_item_batch_metadata() TO service_role;
