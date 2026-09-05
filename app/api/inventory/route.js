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
========================================================= */

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/* =========================================================
   NORMALIZE EXPIRY DATE
 *
 * Database format:
 * YYYY-MM-DD
 *
 * Accepted input:
 * YYYY-MM-DD
 * DD-MM-YYYY
 * DD/MM/YYYY
 * DD-MM-YY
 * DD/MM/YY
========================================================= */

function normalizeExpiryDate(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const input = String(value).trim();

  if (!input) {
    return null;
  }

  // Already canonical YYYY-MM-DD
  let match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const [, year, month, day] = match;

    if (isValidDateParts(year, month, day)) {
      return `${year}-${month}-${day}`;
    }

    throw new Error("Invalid expiry date");
  }

  // DD-MM-YYYY or DD/MM/YYYY
  match = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (match) {
    const [, day, month, year] = match;

    if (isValidDateParts(year, month, day)) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    throw new Error("Invalid expiry date");
  }

  // DD-MM-YY or DD/MM/YY
  match = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);

  if (match) {
    const [, day, month, shortYear] = match;

    const yearNumber = Number(shortYear);

    // Pharmacy stock dates are normally contemporary.
    // Interpret 00–49 as 2000–2049 and 50–99 as 1950–1999.
    const year =
      yearNumber <= 49
        ? 2000 + yearNumber
        : 1900 + yearNumber;

    const yearString = String(year);

    if (isValidDateParts(yearString, month, day)) {
      return `${yearString}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}`;
    }

    throw new Error("Invalid expiry date");
  }

  throw new Error(
    "Invalid expiry date. Use YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY."
  );
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }

  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/* =========================================================
   BUILD PRICE INDEX FROM medicines.js
========================================================= */

function buildCatalogIndex() {
  const index = new Map();

  for (const category of CATALOG || []) {
    if (!Array.isArray(category?.items)) continue;

    for (const medicine of category.items) {
      const name = normalizeName(medicine?.name);

      if (!name) continue;

      const mrp = Number(medicine?.mrp);

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

  const exact = index.get(inventoryName);

  if (exact) {
    return exact;
  }

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
        : body?.batchNo === null ||
          String(body.batchNo).trim() === ""
          ? null
          : String(body.batchNo).trim();

    /* =======================================================
       EXPIRY DATE
    ======================================================= */

    let expiryDate;

    if (body?.expiryDate === undefined) {
      expiryDate = undefined;
    } else {
      try {
        expiryDate = normalizeExpiryDate(
          body?.expiryDate
        );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error?.message ||
              "Invalid expiry date",
          },
          {
            status: 400,
          }
        );
      }
    }

    /* =======================================================
       STOCK STATUS
    ======================================================= */

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

    /*
     * Only change batch/expiry when supplied.
     * This prevents a stock-only update from clearing metadata.
     */

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

    /* =======================================================
       RETURN CATALOG PRICE
    ======================================================= */

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
