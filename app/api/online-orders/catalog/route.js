import { NextResponse } from "next/server";
import { CATALOG } from "../../../../lib/medicines";
import { medicineKey } from "../../../../lib/inventory";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function parseExpiry(value) {
  if (!value) return null;
  const t = String(value).trim();
  let m = t.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(`20${m[3]}`), Number(m[2]) - 1, Number(m[1]));
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function label(schedule, nrx, legacy) {
  if (nrx && schedule) return `Schedule ${schedule} · NRx · Prescription`;
  if (nrx) return "NRx · Prescription";
  if (schedule) return `Schedule ${schedule} · Prescription`;
  return legacy ? "Prescription required" : "";
}

export async function GET() {
  try {
    const [
      { data: batches, error: batchError },
      { data: inventory, error: inventoryError },
      { data: classes, error: classError },
    ] = await Promise.all([
      supabaseAdmin
        .from("inventory_batches")
        .select("medicine_id,quantity,expiry")
        .gt("quantity", 0),
      supabaseAdmin
        .from("inventory")
        .select("medicine_id,quantity")
        .gt("quantity", 0),
      supabaseAdmin
        .from("medicine_regulatory_classification")
        .select("medicine_id,schedule,nrx"),
    ]);

    if (batchError) throw batchError;
    if (inventoryError) throw inventoryError;
    if (classError) throw classError;

    const classMap = new Map(
      (classes || []).map((row) => [String(row.medicine_id), row])
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If ANY batch record exists for a medicine, it is batch-managed:
    // only positive, non-expired batch stock is sellable.
    const batchMedicineIds = new Set(
      (batches || []).map((row) => String(row.medicine_id))
    );

    const sellable = new Map();

    for (const batch of batches || []) {
      const expiry = parseExpiry(batch.expiry);

      if (expiry && expiry < today) continue;

      const id = String(batch.medicine_id);
      sellable.set(
        id,
        (sellable.get(id) || 0) + Number(batch.quantity || 0)
      );
    }

    // Fallback ONLY when there is no inventory_batches record at all.
    // This fixes medicines such as catalog/inventory-only items without
    // bypassing expiry protection for batch-managed medicines.
    for (const row of inventory || []) {
      const id = String(row.medicine_id);

      if (batchMedicineIds.has(id)) continue;

      const quantity = Number(row.quantity || 0);

      if (quantity > 0) {
        sellable.set(id, quantity);
      }
    }

    const seen = new Set();
    const products = [];

    for (const category of CATALOG || []) {
      for (const medicine of category?.items || []) {
        const name = String(medicine?.name || "").trim();
        const mrp = Number(medicine?.mrp);

        if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;

        const id = medicineKey(name);

        if (seen.has(id)) continue;
        seen.add(id);

        const legacy = Boolean(medicine.prescription);
        const classification = classMap.get(String(id));

        const schedule = classification?.schedule || null;
        const nrx = Boolean(classification?.nrx);
        const prescriptionRequired =
          Boolean(schedule) || nrx || legacy;

        products.push({
          id,
          name,
          mrp,
          category_id: category.id,
          category: category.name,
          category_icon: category.icon,

          prescription: prescriptionRequired,
          prescription_required: prescriptionRequired,

          schedule,
          nrx,

          prescription_label: label(
            schedule,
            nrx,
            legacy
          ),

          in_stock:
            (sellable.get(String(id)) || 0) > 0,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        products,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Online catalog error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load online catalog.",
      },
      {
        status: 500,
      }
    );
  }
}
