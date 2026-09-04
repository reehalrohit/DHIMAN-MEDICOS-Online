import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import {
  verifyWebhookSignature,
} from "../../../../../lib/razorpay";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    // IMPORTANT:
    // Razorpay webhook signature must be calculated
    // against the exact raw request body.
    const rawBody = await request.text();

    const signature =
      request.headers.get(
        "x-razorpay-signature"
      );

    if (
      !verifyWebhookSignature(
        rawBody,
        signature
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid webhook signature.",
        },
        { status: 400 }
      );
    }

    const payload = JSON.parse(rawBody);

    const event = String(
      payload?.event || ""
    );

    // Successful payment events.
    if (
      event === "order.paid" ||
      event === "payment.captured"
    ) {
      const orderId = String(
        payload?.payload?.order?.entity?.id ||
          payload?.payload?.payment?.entity
            ?.order_id ||
          ""
      );

      const paymentId = String(
        payload?.payload?.payment?.entity?.id ||
          ""
      );

      if (orderId && paymentId) {
        const {
          data: paymentOrder,
          error: lookupError,
        } = await supabaseAdmin
          .from("payment_orders")
          .select("id, status")
          .eq(
            "razorpay_order_id",
            orderId
          )
          .maybeSingle();

        if (lookupError) {
          throw lookupError;
        }

        if (
          paymentOrder &&
          paymentOrder.status !== "paid"
        ) {
          const {
            error,
          } = await supabaseAdmin.rpc(
            "finalize_razorpay_payment",
            {
              p_payment_order_id:
                paymentOrder.id,
              p_payment_id: paymentId,
            }
          );

          if (error) {
            throw error;
          }
        }
      }
    }

    // Failed payment event.
    else if (
      event === "payment.failed"
    ) {
      const orderId = String(
        payload?.payload?.payment?.entity
          ?.order_id || ""
      );

      if (orderId) {
        await supabaseAdmin
          .from("payment_orders")
          .update({
            status: "failed",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "razorpay_order_id",
            orderId
          )
          .neq("status", "paid");
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Razorpay webhook error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Webhook processing failed.",
      },
      { status: 500 }
    );
  }
            }
