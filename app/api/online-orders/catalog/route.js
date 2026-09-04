import { NextResponse } from "next/server";
import { CATALOG } from "../../../../lib/medicines";
import { medicineKey } from "../../../../lib/inventory";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function parseExpiry(value) {
  if (!value) return null;
  const text = String(value).trim();
  let match = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(`20${match[3]}`), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return null;
}

export async function GET() {
  try {
    const { data: batches, error } = await supabaseAdmin
      .from("inventory_batches")
      .select("medicine_id,quantity,expiry")
      .gt("quantity", 0);
    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sellable = new Map();
    for (const batch of batches || []) {
      const expiry = parseExpiry(batch.expiry);
      if (expiry && expiry < today) continue;
      const id = String(batch.medicine_id);
      sellable.set(id, (sellable.get(id) || 0) + Number(batch.quantity || 0));
    }

    const seen = new Set();
    const products = [];
    for (const category of CATALOG || []) {
      for (const medicine of category?.items || []) {
        const name = String(medicine?.name || "").trim();
        const mrp = Number(medicine?.mrp);
        if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;
        const medicineId = medicineKey(name);
        if (seen.has(medicineId)) continue;
        seen.add(medicineId);
        const availableQty = sellable.get(String(medicineId)) || 0;
        products.push({
          id: medicineId,
          name,
          mrp,
          category_id: category.id,
          category: category.name,
          category_icon: category.icon,
          prescription: Boolean(medicine.prescription),
          in_stock: availableQty > 0,
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
