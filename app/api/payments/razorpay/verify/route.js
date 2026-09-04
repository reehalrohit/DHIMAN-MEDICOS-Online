import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import {
  razorpayRequest,
  verifyPaymentSignature,
} from "../../../../../lib/razorpay";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();

    const orderId = String(
      body?.razorpay_order_id || ""
    ).trim();

    const paymentId = String(
      body?.razorpay_payment_id || ""
    ).trim();

    const signature = String(
      body?.razorpay_signature || ""
    ).trim();

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        {
          success: false,
          error: "Incomplete payment response.",
        },
        { status: 400 }
      );
    }

    // Find our local payment order.
    const {
      data: paymentOrder,
      error: lookupError,
    } = await supabaseAdmin
      .from("payment_orders")
      .select(
        "id, razorpay_order_id, amount_paise, currency, status"
      )
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (!paymentOrder) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment order not found.",
        },
        { status: 404 }
      );
    }

    // Idempotency: already completed.
    if (paymentOrder.status === "paid") {
      return NextResponse.json({
        success: true,
        already_paid: true,
      });
    }

    // Verify Razorpay HMAC signature.
    if (
      !verifyPaymentSignature({
        orderId,
        paymentId,
        signature,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment signature verification failed.",
        },
        { status: 400 }
      );
    }

    // Ask Razorpay for the actual payment.
    const payment = await razorpayRequest(
      `/payments/${encodeURIComponent(paymentId)}`
    );

    // Make sure payment belongs to our order.
    if (payment.order_id !== orderId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment does not belong to this order.",
        },
        { status: 400 }
      );
    }

    // Verify amount and currency against our server-side order.
    if (
      Number(payment.amount) !==
        Number(paymentOrder.amount_paise) ||
      payment.currency !== paymentOrder.currency
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment amount mismatch.",
        },
        { status: 400 }
      );
    }

    // Only captured payments are finalized.
    if (payment.status !== "captured") {
      return NextResponse.json(
        {
          success: false,
          pending:
            payment.status === "authorized",
          error: `Payment is not captured yet (${payment.status}).`,
        },
        { status: 409 }
      );
    }

    // Atomically finalize the sale and payment.
    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "finalize_razorpay_payment",
      {
        p_payment_order_id: paymentOrder.id,
        p_payment_id: paymentId,
      }
    );

    if (error) {
      throw error;
    }

    return NextResponse.json(
      data || { success: true }
    );
  } catch (error) {
    console.error(
      "Razorpay verify error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Payment verification failed.",
      },
      { status: 500 }
    );
  }
}
