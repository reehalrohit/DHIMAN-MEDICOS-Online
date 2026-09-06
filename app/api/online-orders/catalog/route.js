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
  if (m) return new Date(Number(m[4]), Number(m[2]) - 1, Number(m[1]));
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
      { data: offers, error: offerError },
    ] = await Promise.all([
      supabaseAdmin.from("inventory_batches").select("medicine_id,quantity,expiry").gt("quantity", 0),
      supabaseAdmin.from("inventory").select("medicine_id,quantity").gt("quantity", 0),
      supabaseAdmin.from("medicine_regulatory_classification").select("medicine_id,schedule,nrx"),
      supabaseAdmin.from("medicine_offer_rules").select("medicine_id,is_generic,discount_type,discount_value,active,starts_at,ends_at"),
    ]);

    if (batchError) throw batchError;
    if (inventoryError) throw inventoryError;
    if (classError) throw classError;
    if (offerError) throw offerError;

    const classMap = new Map((classes || []).map((r) => [String(r.medicine_id), r]));
    const offerMap = new Map((offers || []).map((r) => [String(r.medicine_id), r]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const batchIds = new Set((batches || []).map((r) => String(r.medicine_id)));
    const sellable = new Map();

    for (const b of batches || []) {
      const expiry = parseExpiry(b.expiry);
      if (expiry && expiry < today) continue;
      const id = String(b.medicine_id);
      sellable.set(id, (sellable.get(id) || 0) + Number(b.quantity || 0));
    }

    for (const row of inventory || []) {
      const id = String(row.medicine_id);
      if (batchIds.has(id)) continue;
      const quantity = Number(row.quantity || 0);
      if (quantity > 0) sellable.set(id, quantity);
    }

    const products = [];
    const seen = new Set();

    for (const category of CATALOG || []) {
      for (const medicine of category?.items || []) {
        const name = String(medicine?.name || "").trim();
        const mrp = Number(medicine?.mrp);
        if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;

        const id = medicineKey(name);
        if (seen.has(id)) continue;
        seen.add(id);

        const legacy = Boolean(medicine.prescription);
        const c = classMap.get(id);
        const o = offerMap.get(id);

        const schedule = c?.schedule || null;
        const nrx = Boolean(c?.nrx);
        const prescriptionRequired = Boolean(schedule) || nrx || legacy;

        const windowOpen = Boolean(o?.active)
          && (!o?.starts_at || new Date(o.starts_at) <= now)
          && (!o?.ends_at || new Date(o.ends_at) >= now);

        const generic = Boolean(o?.is_generic);

        let discountAmount = 0;

        if (generic && windowOpen) {
          if (o.discount_type === "percent") {
            discountAmount = mrp * Number(o.discount_value || 0) / 100;
          } else {
            discountAmount = Number(o.discount_value || 0);
          }
          discountAmount = Math.min(mrp, Math.max(0, discountAmount));
        }

        discountAmount = Math.round(discountAmount * 100) / 100;
        const sellingPrice = Math.round((mrp - discountAmount) * 100) / 100;

        products.push({
          id,
          name,
          mrp,
          selling_price: sellingPrice,
          discount_amount: discountAmount,
          discount_percent: mrp ? Math.round(discountAmount * 100 / mrp) : 0,
          discount_eligible: generic,
          is_generic: generic,
          category_id: category.id,
          category: category.name,
          category_icon: category.icon,
          prescription: prescriptionRequired,
          prescription_required: prescriptionRequired,
          schedule,
          nrx,
          prescription_label: label(schedule, nrx, legacy),
          in_stock: (sellable.get(id) || 0) > 0,
        });
      }
    }

    return NextResponse.json(
      { success: true, products },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Online catalog error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load online catalog." },
      { status: 500 }
    );
  }
}
