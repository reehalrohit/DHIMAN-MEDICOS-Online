import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { CATALOG } from "../../../lib/medicines";

import {
  medicineKey,
  normalizeQuantity,
  getStockStatus,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from "../../../lib/inventory";

/* =========================================================
   SUPABASE ADMIN
========================================================= */

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* =========================================================
   NORMALIZE MEDICINE NAME

   Used only for matching inventory medicines with medicines.js
========================================================= */

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/* =========================================================
   BUILD PRICE INDEX FROM medicines.js

   CATALOG structure:

   [
     {
       id: "...",
       name: "...",
       items: [
         {
           name: "...",
           mrp: 123.45
         }
       ]
     }
   ]
========================================================= */

function buildCatalogIndex() {
  const index = new Map();

  for (const category of CATALOG || []) {
    if (!Array.isArray(category?.items)) continue;

    for (const medicine of category.items) {
      const name = normalizeName(medicine?.name);

      if (!name) continue;

      const mrp = Number(medicine?.mrp);

      /*
       * Keep first valid catalog entry.
       *
       * This avoids a later duplicate accidentally replacing
       * a valid price with an invalid value.
       */
      if (!index.has(name)) {
        index.set(name, {
          name: medicine.name,
          mrp: Number.isFinite(mrp) ? mrp : 0,
          category: category.name || "",
          category_id: category.id || "",
        });
      }
    }
  }

  return index;
}

/* =========================================================
   FIND CATALOG MEDICINE
========================================================= */

function findCatalogMedicine(index, inventoryRow) {
  const inventoryName = normalizeName(inventoryRow?.medicine_name);

  if (!inventoryName) {
    return null;
  }

  /*
   * First try exact normalized name.
   */
  const exact = index.get(inventoryName);

  if (exact) {
    return exact;
  }

  /*
   * Second attempt:
   * compare medicineKey values.
   *
   * Useful when inventory medicine_id was originally created
   * using medicineKey(name).
   */
  const inventoryKey = String(
    inventoryRow?.medicine_id || medicineKey(inventoryName)
  );

  for (const [catalogName, medicine] of index.entries()) {
    if (medicineKey(catalogName) === inventoryKey) {
      return medicine;
    }
  }

  return null;
}

/* =========================================================
   GET /api/inventory

   Combines:

   Supabase
      quantity
      stock status
      medicine_id

   medicines.js
      mrp
      category

========================================================= */

export async function GET(request) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);

    const medicineId = searchParams.get("medicine_id");

    let query = supabase
      .from("inventory")
      .select("*")
      .order("updated_at", { ascending: false });

    if (medicineId) {
      query = query.eq("medicine_id", medicineId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const catalogIndex = buildCatalogIndex();

    const inventory = (data || []).map((row) => {
      const catalogMedicine = findCatalogMedicine(
        catalogIndex,
        row
      );

      /*
       * Prefer catalog MRP.
       *
       * If no catalog match exists, try any price already
       * stored in Supabase.
       */
      const catalogMrp = Number(catalogMedicine?.mrp);

      const databaseMrp = Number(
        row?.mrp ??
          row?.price ??
          row?.selling_price ??
          0
      );

      const mrp =
        Number.isFinite(catalogMrp) && catalogMrp > 0
          ? catalogMrp
          : Number.isFinite(databaseMrp)
            ? databaseMrp
            : 0;

      return {
        ...row,

        /*
         * POS can use either mrp or price.
         */
        mrp,
        price: mrp,

        category:
          catalogMedicine?.category ||
          row?.category ||
          "",

        catalog_match: Boolean(catalogMedicine),
      };
    });

    return NextResponse.json({
      success: true,
      count: inventory.length,
      inventory,
    });
  } catch (error) {
    console.error("Inventory GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to load inventory",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST /api/inventory

   Creates or updates stock level.
========================================================= */

export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();

    const body = await request.json();

    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Medicine name is required",
        },
        {
          status: 400,
        }
      );
    }

    const medicineId =
      String(body?.medicineId || "").trim() ||
      medicineKey(name);

    const quantity = normalizeQuantity(
      body?.quantity
    );

    const lowStockAt = normalizeQuantity(
      body?.lowStockAt ??
        DEFAULT_LOW_STOCK_THRESHOLD
    );

    const batchNo =
      body?.batchNo === undefined
        ? undefined
        : body?.batchNo === null || String(body.batchNo).trim() === ""
          ? null
          : String(body.batchNo).trim();

    const expiryDate =
      body?.expiryDate === undefined
        ? undefined
        : body?.expiryDate === null || String(body.expiryDate).trim() === ""
          ? null
          : String(body.expiryDate).trim();

    if (
      expiryDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "expiryDate must use YYYY-MM-DD format",
        },
        { status: 400 }
      );
    }

    const status = getStockStatus(
      quantity,
      lowStockAt
    );

    const record = {
      medicine_id: medicineId,
      medicine_name: name,
      quantity,
      low_stock_at: lowStockAt,
      status,
      updated_at: new Date().toISOString(),
    };

    // Only change batch/expiry when the caller supplied those fields.
    // This prevents a stock-only update from accidentally clearing metadata.
    if (batchNo !== undefined) {
      record.batch_no = batchNo;
    }

    if (expiryDate !== undefined) {
      record.expiry_date = expiryDate;
    }

    const { data, error } = await supabase
      .from("inventory")
      .upsert(record, {
        onConflict: "medicine_id",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    /*
     * Return MRP immediately as well.
     */
    const catalogIndex = buildCatalogIndex();

    const catalogMedicine = findCatalogMedicine(
      catalogIndex,
      data
    );

    const mrp = Number(
      catalogMedicine?.mrp || 0
    );

    return NextResponse.json({
      success: true,

      inventory: {
        ...data,

        mrp:
          Number.isFinite(mrp)
            ? mrp
            : 0,

        price:
          Number.isFinite(mrp)
            ? mrp
            : 0,

        category:
          catalogMedicine?.category || "",

        catalog_match:
          Boolean(catalogMedicine),
      },
    });
  } catch (error) {
    console.error("Inventory POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to update inventory",
      },
      {
        status: 500,
      }
    );
  }
}
