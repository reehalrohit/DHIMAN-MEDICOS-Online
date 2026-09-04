import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const [inventoryResult, batchesResult] = await Promise.all([
      supabase
        .from("inventory")
        .select("id, medicine_id, medicine_name, mrp, selling_price, quantity, status")
        .gt("quantity", 0)
        .order("medicine_name"),
      supabase
        .from("inventory_batches")
        .select("id, medicine_id, medicine_name, batch_no, expiry, mrp, quantity")
        .gt("quantity", 0),
    ]);

    if (inventoryResult.error) throw inventoryResult.error;
    if (batchesResult.error) throw batchesResult.error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function parseBatchExpiry(value) {
      if (!value) return null;
      const text = String(value).trim();
      let match = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, dd, mm, yy] = match;
        return new Date(Number(`20${yy}`), Number(mm) - 1, Number(dd));
      }
      match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      }
      match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, yyyy, mm, dd] = match;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      }
      return null;
    }

    const sellableBatches = (batchesResult.data || []).filter((batch) => {
      const expiry = parseBatchExpiry(batch.expiry);
      return !expiry || expiry >= today;
    });

    // Only expose medicines that have at least one positive, non-expired batch.
    // This prevents expired-only stock from appearing at the POS.
    const sellableMedicineIds = new Set(
      sellableBatches.map((batch) => String(batch.medicine_id))
    );

    const sellableInventory = (inventoryResult.data || []).filter((item) =>
      sellableMedicineIds.has(String(item.medicine_id))
    );

    return NextResponse.json({
      success: true,
      inventory: sellableInventory,
      batches: sellableBatches,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("POS inventory API error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to load POS inventory" }, { status: 500 });
  }
}
