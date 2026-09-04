import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
export const dynamic = "force-dynamic";
export async function GET(_request, { params }) {
  try {
    const token = String((await params)?.token || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ success: false, error: "Invalid tracking link." }, { status: 400 });
    const { data: order, error } = await supabaseAdmin.from("customer_orders").select("id,order_number,tracking_token,customer_name,customer_phone,address_line1,address_line2,landmark,city,state,pincode,delivery_method,notes,subtotal,discount,delivery_fee,total,payment_method,payment_status,order_status,prescription_status,created_at,updated_at,sale_id").eq("tracking_token", token).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
    const { data: items, error: itemError } = await supabaseAdmin.from("customer_order_items").select("medicine_name,quantity,unit_price,line_total").eq("order_id", order.id).order("id", { ascending: true });
    if (itemError) throw itemError;
    const { data: events, error: eventError } = await supabaseAdmin.from("customer_order_events").select("status,note,created_at").eq("order_id", order.id).order("created_at", { ascending: true });
    if (eventError) throw eventError;
    return NextResponse.json({ success: true, order: { ...order, items: items || [], events: events || [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Online order tracking error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load order." }, { status: 500 });
  }
}
