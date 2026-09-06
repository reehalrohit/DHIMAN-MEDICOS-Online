import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("medicine_offer_rules")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, offers: data || [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load discount rules." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    const medicineId = String(body?.medicine_id || "").trim();
    const isGeneric = Boolean(body?.is_generic);
    const discountType = String(body?.discount_type || "percent").trim().toLowerCase();
    const discountValue = Number(body?.discount_value || 0);
    const active = Boolean(body?.active);

    if (!medicineId) {
      return NextResponse.json(
        { success: false, error: "Medicine ID is required." },
        { status: 400 }
      );
    }

    if (!["percent", "flat"].includes(discountType)) {
      return NextResponse.json(
        { success: false, error: "Invalid discount type." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return NextResponse.json(
        { success: false, error: "Discount must be zero or greater." },
        { status: 400 }
      );
    }

    if (discountType === "percent" && discountValue > 100) {
      return NextResponse.json(
        { success: false, error: "Percentage discount cannot exceed 100%." },
        { status: 400 }
      );
    }

    const payload = {
      medicine_id: medicineId,
      is_generic: isGeneric,
      discount_type: discountType,
      discount_value: Math.round(discountValue * 100) / 100,
      active,
      starts_at: body?.starts_at || null,
      ends_at: body?.ends_at || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("medicine_offer_rules")
      .upsert(payload, { onConflict: "medicine_id" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, offer: data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to save discount rule." },
      { status: 500 }
    );
  }
}
