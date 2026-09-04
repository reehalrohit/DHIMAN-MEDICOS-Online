import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request) {
  try {
    const supabase = getSupabase();

    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit")) || 50, 1),
      100
    );

    // ─────────────────────────────────────────────
    // Load sales
    // ─────────────────────────────────────────────

    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (salesError) {
      throw salesError;
    }

    if (!sales?.length) {
      return NextResponse.json(
        {
          success: true,
          sales: [],
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    // ─────────────────────────────────────────────
    // Load sale items
    // ─────────────────────────────────────────────

    const saleIds = sales.map((sale) => sale.id);

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select("*")
      .in("sale_id", saleIds)
      .order("id", { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    // ─────────────────────────────────────────────
    // Group items by sale
    // ─────────────────────────────────────────────

    const itemsBySale = {};

    for (const item of items || []) {
      const saleId = String(item.sale_id);

      if (!itemsBySale[saleId]) {
        itemsBySale[saleId] = [];
      }

      itemsBySale[saleId].push(item);
    }

    // ─────────────────────────────────────────────
    // Combine invoice + items
    // ─────────────────────────────────────────────

    const result = sales.map((sale) => ({
      ...sale,
      items: itemsBySale[String(sale.id)] || [],
    }));

    return NextResponse.json(
      {
        success: true,
        sales: result,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("POS sales history error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to load POS sales history.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
        }
