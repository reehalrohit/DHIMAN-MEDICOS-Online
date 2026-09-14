import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CATALOG } from "../../../lib/medicines";
import {
  medicineKey,
  normalizeQuantity,
  getStockStatus,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from "../../../lib/inventory";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not configured"
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeMoney(value, fallback = 0) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    throw new Error(
      "Price must be a valid number greater than or equal to 0"
    );
  }

  return Math.round(number * 100) / 100;
}

function normalizeExpiryDate(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const input = String(value).trim();

  let match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    const [, year, month, day] = match;

    if (
      isValidDateParts(
        year,
        month,
        day
      )
    ) {
      return `${year}-${month}-${day}`;
    }

    throw new Error(
      "Invalid expiry date"
    );
  }

  match = input.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
  );

  if (match) {
    const [, day, month, year] =
      match;

    if (
      isValidDateParts(
        year,
        month,
        day
      )
    ) {
      return `${year}-${month.padStart(
        2,
        "0"
      )}-${day.padStart(2, "0")}`;
    }

    throw new Error(
      "Invalid expiry date"
    );
  }

  match = input.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/
  );

  if (match) {
    const [
      ,
      day,
      month,
      shortYear,
    ] = match;

    const n = Number(shortYear);
    const year =
      n <= 49
        ? 2000 + n
        : 1900 + n;

    if (
      isValidDateParts(
        year,
        month,
        day
      )
    ) {
      return `${year}-${month.padStart(
        2,
        "0"
      )}-${day.padStart(2, "0")}`;
    }

    throw new Error(
      "Invalid expiry date"
    );
  }

  throw new Error(
    "Invalid expiry date. Use YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY."
  );
}

function isValidDateParts(
  year,
  month,
  day
) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d)
  ) {
    return false;
  }

  if (
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return false;
  }

  const date = new Date(
    Date.UTC(y, m - 1, d)
  );

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function buildCatalogIndex() {
  const index = new Map();

  for (const category of CATALOG || []) {
    if (
      !Array.isArray(
        category?.items
      )
    ) {
      continue;
    }

    for (const medicine of category.items) {
      const name = normalizeName(
        medicine?.name
      );

      if (!name) continue;

      const mrp = Number(
        medicine?.mrp
      );

      if (!index.has(name)) {
        index.set(name, {
          name: medicine.name,
          mrp:
            Number.isFinite(mrp)
              ? mrp
              : 0,
          category:
            category?.name || "",
          category_id:
            category?.id || "",
        });
      }
    }
  }

  return index;
}

function findCatalogMedicine(
  index,
  row
) {
  const inventoryName =
    normalizeName(
      row?.medicine_name
    );

  if (!inventoryName) {
    return null;
  }

  const exact =
    index.get(inventoryName);

  if (exact) {
    return exact;
  }

  const inventoryKey =
    String(
      row?.medicine_id ||
        medicineKey(
          inventoryName
        )
    );

  for (
    const [
      catalogName,
      medicine,
    ] of index.entries()
  ) {
    if (
      medicineKey(
        catalogName
      ) === inventoryKey
    ) {
      return medicine;
    }
  }

  return null;
}

export async function GET(
  request
) {
  try {
    const supabase =
      getSupabaseAdmin();

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const medicineId =
      searchParams.get(
        "medicine_id"
      );

    let query = supabase
      .from("inventory")
      .select("*")
      .order(
        "updated_at",
        {
          ascending: false,
        }
      );

    if (medicineId) {
      query = query.eq(
        "medicine_id",
        medicineId
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    const catalogIndex =
      buildCatalogIndex();

    const inventory =
      (data || []).map(
        (row) => {
          const catalogMedicine =
            findCatalogMedicine(
              catalogIndex,
              row
            );

          const catalogMrp =
            Number(
              catalogMedicine?.mrp ||
                0
            );

          const databaseMrp =
            Number(
              row?.mrp || 0
            );

          const mrp =
            databaseMrp > 0
              ? databaseMrp
              : catalogMrp;

          const purchaseRate =
            Number(
              row?.purchase_price ||
                0
            );

          const netRate =
            Number(
              row?.net_rate ??
                purchaseRate ??
                0
            );

          const saleRate =
            Number(
              row?.selling_price ||
                0
            );

          return {
            ...row,
            mrp,
            purchase_rate:
              Number.isFinite(
                purchaseRate
              )
                ? purchaseRate
                : 0,
            net_rate:
              Number.isFinite(
                netRate
              )
                ? netRate
                : 0,
            sale_rate:
              Number.isFinite(
                saleRate
              )
                ? saleRate
                : 0,
            price:
              saleRate > 0
                ? saleRate
                : mrp,
            category:
              row?.category ||
              catalogMedicine?.category ||
              "",
            category_id:
              row?.category_id ||
              catalogMedicine?.category_id ||
              "",
            catalog_match:
              Boolean(
                catalogMedicine
              ),
          };
        }
      );

    return NextResponse.json({
      success: true,
      count:
        inventory.length,
      inventory,
    });
  } catch (error) {
    console.error(
      "Inventory GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to load inventory",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request
) {
  try {
    const supabase =
      getSupabaseAdmin();

    const body =
      await request.json();

    const name = String(
      body?.name || ""
    ).trim();

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Medicine name is required",
        },
        { status: 400 }
      );
    }

    const medicineId =
      String(
        body?.medicineId || ""
      ).trim() ||
      medicineKey(name);

    const quantity =
      normalizeQuantity(
        body?.quantity
      );

    const lowStockAt =
      normalizeQuantity(
        body?.lowStockAt ??
          DEFAULT_LOW_STOCK_THRESHOLD
      );

    const existingQuery =
      await supabase
        .from("inventory")
        .select(
          "mrp,purchase_price,net_rate,selling_price"
        )
        .eq(
          "medicine_id",
          medicineId
        )
        .maybeSingle();

    if (
      existingQuery.error
    ) {
      throw existingQuery.error;
    }

    const existing =
      existingQuery.data || {};

    const mrp =
      normalizeMoney(
        body?.mrp,
        Number(
          existing.mrp || 0
        )
      );

    const purchasePrice =
      normalizeMoney(
        body?.purchasePrice,
        Number(
          existing.purchase_price ||
            0
        )
      );

    const netRate =
      normalizeMoney(
        body?.netRate,
        Number(
          existing.net_rate ??
            purchasePrice ??
            0
        )
      );

    const sellingPrice =
      normalizeMoney(
        body?.sellingPrice,
        Number(
          existing.selling_price ||
            mrp ||
            0
        )
      );

    const batchNo =
      body?.batchNo === undefined
        ? undefined
        : body?.batchNo === null ||
          String(
            body.batchNo
          ).trim() === ""
        ? null
        : String(
            body.batchNo
          ).trim();

    let expiryDate;

    if (
      body?.expiryDate ===
      undefined
    ) {
      expiryDate =
        undefined;
    } else {
      expiryDate =
        normalizeExpiryDate(
          body?.expiryDate
        );
    }

    const status =
      getStockStatus(
        quantity,
        lowStockAt
      );

    const record = {
      medicine_id:
        medicineId,
      medicine_name:
        name,
      quantity,
      low_stock_at:
        lowStockAt,
      status,
      mrp,
      purchase_price:
        purchasePrice,
      net_rate:
        netRate,
      selling_price:
        sellingPrice,
      updated_at:
        new Date().toISOString(),
    };

    if (
      batchNo !==
      undefined
    ) {
      record.batch_no =
        batchNo;
    }

    if (
      expiryDate !==
      undefined
    ) {
      record.expiry_date =
        expiryDate;
    }

    const {
      data,
      error,
    } = await supabase
      .from("inventory")
      .upsert(
        record,
        {
          onConflict:
            "medicine_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    const catalogIndex =
      buildCatalogIndex();

    const catalogMedicine =
      findCatalogMedicine(
        catalogIndex,
        data
      );

    return NextResponse.json({
      success: true,
      inventory: {
        ...data,
        mrp:
          Number(
            data?.mrp ||
              catalogMedicine?.mrp ||
              0
          ),
        purchase_rate:
          Number(
            data?.purchase_price ||
              0
          ),
        net_rate:
          Number(
            data?.net_rate ||
              0
          ),
        sale_rate:
          Number(
            data?.selling_price ||
              0
          ),
        price:
          Number(
            data?.selling_price ||
              data?.mrp ||
              0
          ),
        category:
          data?.category ||
          catalogMedicine?.category ||
          "",
        category_id:
          data?.category_id ||
          catalogMedicine?.category_id ||
          "",
        catalog_match:
          Boolean(
            catalogMedicine
          ),
      },
    });
  } catch (error) {
    console.error(
      "Inventory POST error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to update inventory",
      },
      { status: 500 }
    );
  }
}
