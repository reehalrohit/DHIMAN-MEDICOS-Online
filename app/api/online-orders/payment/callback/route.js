import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { razorpayRequest, verifyPaymentSignature } from "../../../../../lib/razorpay";

export const dynamic = "force-dynamic";

function redirectToOrder(request, trackingToken, status) {
  const url = new URL(`/order/${encodeURIComponent(trackingToken)}`, request.url);
  url.searchParams.set("payment", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const orderId = String(form.get("razorpay_order_id") || "").trim();
    const paymentId = String(form.get("razorpay_payment_id") || "").trim();
    const signature = String(form.get("razorpay_signature") || "").trim();

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ success: false, error: "Incomplete payment response." }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from("customer_orders")
      .select("id,order_number,tracking_token,total,razorpay_order_id,payment_status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return NextResponse.json({ success: false, error: "Online order payment not found." }, { status: 404 });
    }

    if (order.payment_status === "paid") {
      return redirectToOrder(request, order.tracking_token, "success");
    }

    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      return redirectToOrder(request, order.tracking_token, "failed");
    }

    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);

    if (
      payment.order_id !== orderId ||
      Number(payment.amount) !== Math.round(Number(order.total) * 100) ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return redirectToOrder(request, order.tracking_token, "failed");
    }

    const { error: updateError } = await supabaseAdmin
      .from("customer_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("payment_status", "pending");

    if (updateError) throw updateError;

    await supabaseAdmin.from("customer_order_events").insert({
      order_id: order.id,
      status: "payment_paid",
      note: `Razorpay payment captured: ${paymentId}`,
    });

    return redirectToOrder(request, order.tracking_token, "success");
  } catch (error) {
    console.error("Razorpay WebView callback error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Payment callback failed." },
      { status: 500 }
    );
  }
}
