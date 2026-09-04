import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { razorpayRequest, verifyPaymentSignature } from "../../../../../lib/razorpay";
export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    const body = await request.json();
    const orderId = String(body?.razorpay_order_id || "").trim();
    const paymentId = String(body?.razorpay_payment_id || "").trim();
    const signature = String(body?.razorpay_signature || "").trim();
    if (!orderId || !paymentId || !signature) return NextResponse.json({ success: false, error: "Incomplete payment response." }, { status: 400 });
    const { data: order, error } = await supabaseAdmin.from("customer_orders").select("id,order_number,tracking_token,total,razorpay_order_id,payment_status").eq("razorpay_order_id", orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ success: false, error: "Online order payment not found." }, { status: 404 });
    if (order.payment_status === "paid") return NextResponse.json({ success: true, already_paid: true, order });
    if (!verifyPaymentSignature({ orderId, paymentId, signature })) return NextResponse.json({ success: false, error: "Payment signature verification failed." }, { status: 400 });
    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.order_id !== orderId) return NextResponse.json({ success: false, error: "Payment does not belong to this order." }, { status: 400 });
    if (Number(payment.amount) !== Math.round(Number(order.total) * 100) || payment.currency !== "INR") return NextResponse.json({ success: false, error: "Payment amount mismatch." }, { status: 400 });
    if (payment.status !== "captured") return NextResponse.json({ success: false, pending: payment.status === "authorized", error: `Payment is not captured yet (${payment.status}).` }, { status: 409 });
    const { data: updated, error: updateError } = await supabaseAdmin.from("customer_orders").update({ payment_status: "paid", razorpay_payment_id: paymentId, updated_at: new Date().toISOString() }).eq("id", order.id).eq("payment_status", "pending").select("id,order_number,tracking_token,total,payment_status,order_status").single();
    if (updateError) throw updateError;
    await supabaseAdmin.from("customer_order_events").insert({ order_id: order.id, status: "payment_paid", note: `Razorpay payment captured: ${paymentId}` });
    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    console.error("Online order payment verification error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Payment verification failed." }, { status: 500 });
  }
}
