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

function parseBatchExpiry(value) {
  if (!value) return null;
  const text = String(value).trim();
  let m = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    return new Date(Number(`20${yy}`), Number(mm) - 1, Number(dd));
  }
  m = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  return null;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function GET(request) {
  try {
    const supabase = getAdminClient();

    const [inventoryResult, batchesResult] = await Promise.all([
      supabase.from("inventory")
        .select("id, medicine_id, medicine_name, mrp, selling_price, quantity, status")
        .gt("quantity", 0).order("medicine_name"),
      supabase.from("inventory_batches")
        .select("id, medicine_id, medicine_name, batch_no, expiry, mrp, quantity")
        .gt("quantity", 0),
    ]);

    if (inventoryResult.error) throw inventoryResult.error;
    if (batchesResult.error) throw batchesResult.error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sellableBatches = (batchesResult.data || []).filter((batch) => {
      const expiry = parseBatchExpiry(batch.expiry);
      return !expiry || expiry >= today;
    });

    const inventoryByMedicineId = new Map(
      (inventoryResult.data || []).map((item) => [String(item.medicine_id), item])
    );

    const batchGroups = new Map();
    for (const batch of sellableBatches) {
      const id = String(batch.medicine_id);
      if (!batchGroups.has(id)) batchGroups.set(id, []);
      batchGroups.get(id).push(batch);
    }

    const sellableInventory = Array.from(batchGroups.entries())
      .map(([medicineId, medicineBatches]) => {
        const existing = inventoryByMedicineId.get(medicineId);
        const batchQuantity = medicineBatches.reduce(
          (sum, batch) => sum + Number(batch.quantity || 0), 0
        );

        if (existing) {
          return {
            ...existing,
            quantity: Number(existing.quantity || 0) > 0
              ? existing.quantity
              : batchQuantity,
          };
        }

        const first = medicineBatches[0];
        return {
          id: `batch-${medicineId}`,
          medicine_id: medicineId,
          medicine_name: first?.medicine_name || medicineId,
          mrp: Number(first?.mrp || 0),
          selling_price: 0,
          quantity: batchQuantity,
          status: "In Stock",
        };
      })
      .sort((a, b) =>
        String(a.medicine_name || "").localeCompare(String(b.medicine_name || ""))
      );

    const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
    let responseInventory = sellableInventory;
    let responseBatches = sellableBatches;

    if (query) {
      const normalizedQuery = normalize(query);
      const matchingIds = new Set(
        sellableInventory.filter((item) => {
          const name = String(item.medicine_name || "").toLowerCase();
          const id = String(item.medicine_id || "").toLowerCase();
          return name.includes(query) || id.includes(query) ||
            normalize(name).includes(normalizedQuery) ||
            normalize(id).includes(normalizedQuery);
        }).map((item) => String(item.medicine_id))
      );

      responseInventory = sellableInventory.filter((item) =>
        matchingIds.has(String(item.medicine_id))
      );
      responseBatches = sellableBatches.filter((batch) =>
        matchingIds.has(String(batch.medicine_id))
      );
    }

    return NextResponse.json(
      { success: true, inventory: responseInventory, batches: responseBatches },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("POS inventory API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load POS inventory" },
      { status: 500 }
    );
  }
}
