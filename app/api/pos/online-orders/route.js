import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const ALLOWED_STATUS = new Set(["confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled", "rejected"]);
const ALLOWED_PRESCRIPTION = new Set(["approved", "rejected"]);

async function loadOrder(id) {
  const { data: order, error } = await supabaseAdmin.from("customer_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Online order not found.");
  const { data: items, error: itemError } = await supabaseAdmin.from("customer_order_items").select("medicine_id,medicine_name,quantity,unit_price,line_total").eq("order_id", id).order("id", { ascending: true });
  if (itemError) throw itemError;
  return { ...order, items: items || [] };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "").trim();
    let query = supabaseAdmin.from("customer_orders").select("*").order("created_at", { ascending: false }).limit(100);
    if (status) query = query.eq("order_status", status);
    const { data: orders, error } = await query;
    if (error) throw error;
    const ids = (orders || []).map((o) => o.id);
    let items = [];
    if (ids.length) {
      const result = await supabaseAdmin.from("customer_order_items").select("order_id,medicine_name,quantity,unit_price,line_total").in("order_id", ids).order("id", { ascending: true });
      if (result.error) throw result.error;
      items = result.data || [];
    }
    const grouped = new Map();
    for (const item of items) grouped.set(item.order_id, [...(grouped.get(item.order_id) || []), item]);
    return NextResponse.json({ success: true, orders: (orders || []).map((o) => ({ ...o, items: grouped.get(o.id) || [] })) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Admin online orders GET:", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load online orders." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "Order ID is required." }, { status: 400 });
    let order = await loadOrder(id);

    if (body?.prescription_status) {
      const next = String(body.prescription_status);
      if (!ALLOWED_PRESCRIPTION.has(next)) return NextResponse.json({ success: false, error: "Invalid prescription status." }, { status: 400 });
      if (order.prescription_status === "not_required") return NextResponse.json({ success: false, error: "This order does not require a prescription." }, { status: 400 });
      if (!order.prescription_id) return NextResponse.json({ success: false, error: "No prescription is attached to this order." }, { status: 400 });
      const { error: pError } = await supabaseAdmin.from("prescriptions").update({ status: next, updated_at: new Date().toISOString() }).eq("id", order.prescription_id).eq("order_id", order.id);
      if (pError) throw pError;
      const { error: oError } = await supabaseAdmin.from("customer_orders").update({ prescription_status: next, updated_at: new Date().toISOString() }).eq("id", order.id);
      if (oError) throw oError;
      await supabaseAdmin.from("customer_order_events").insert({ order_id: order.id, status: `prescription_${next}`, note: `Prescription marked ${next}.` });
      order = await loadOrder(id);
    }

    if (body?.status) {
      const next = String(body.status);
      if (!ALLOWED_STATUS.has(next)) return NextResponse.json({ success: false, error: "Invalid order status." }, { status: 400 });
      if (["cancelled", "rejected"].includes(next) && order.payment_status === "paid") return NextResponse.json({ success: false, error: "Paid orders cannot be cancelled/rejected automatically; refund handling is required first." }, { status: 409 });

      if (next === "confirmed") {
        const rpc = await supabaseAdmin.rpc("confirm_customer_order", { p_order_id: id });
        if (rpc.error) throw rpc.error;
      } else {
        const { error: statusError } = await supabaseAdmin.from("customer_orders").update({ order_status: next, updated_at: new Date().toISOString() }).eq("id", id);
        if (statusError) throw statusError;
      }
      await supabaseAdmin.from("customer_order_events").insert({ order_id: id, status: next, note: `Order status changed to ${next}.` });
    }

    return NextResponse.json({ success: true, order: await loadOrder(id) });
  } catch (error) {
    console.error("Admin online orders PATCH:", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to update online order." }, { status: 500 });
  }
}
