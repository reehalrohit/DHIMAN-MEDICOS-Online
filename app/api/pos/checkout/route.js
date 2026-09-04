import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not configured."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function number(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const items = body?.items;
    const prescriptionId =
  body?.prescription_id !== undefined &&
  body?.prescription_id !== null &&
  body?.prescription_id !== ""
    ? Number(body.prescription_id)
    : null;

    // -------------------------------------------------------
    // VALIDATE CART
    // -------------------------------------------------------

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cart is empty.",
        },
        {
          status: 400,
        }
      );
    }

    const normalizedItems = [];

    for (const item of items) {
      const medicineId = String(
        item?.medicine_id || ""
      ).trim();

      const quantity = Number(
        item?.quantity
      );

      const unitPrice = Number(
        item?.unit_price
      );

      if (!medicineId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A cart item is missing medicine_id.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid quantity for ${medicineId}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid unit price for ${medicineId}.`,
          },
          {
            status: 400,
          }
        );
      }

      const normalizedItem = {
        medicine_id: medicineId,
        quantity,
        unit_price: unitPrice,
      };

      /*
       * Optional batch_id support.
       *
       * Your PostgreSQL pos_checkout() automatically
       * selects the available FEFO batch when batch_id
       * isn't supplied.
       */

      if (
        item?.batch_id !== undefined &&
        item?.batch_id !== null &&
        item?.batch_id !== ""
      ) {
        const batchId = Number(
          item.batch_id
        );

        if (
          !Number.isInteger(batchId) ||
          batchId <= 0
        ) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid batch_id for ${medicineId}.`,
            },
            {
              status: 400,
            }
          );
        }

        normalizedItem.batch_id =
          batchId;
      }

      normalizedItems.push(
        normalizedItem
      );
    }

    // -------------------------------------------------------
    // PAYMENT
    // -------------------------------------------------------

    const allowedPaymentMethods =
      new Set([
        "cash",
        "upi",
        "card",
        "credit",
        "mixed",
      ]);

    const paymentMethod = String(
      body?.payment_method || "cash"
    )
      .trim()
      .toLowerCase();

    if (
      !allowedPaymentMethods.has(
        paymentMethod
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment method.",
        },
        {
          status: 400,
        }
      );
    }

    const discount = number(
      body?.discount,
      0
    );

    if (discount < 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Discount cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    let amountPaid = null;

    if (
      body?.amount_paid !== undefined &&
      body?.amount_paid !== null &&
      body?.amount_paid !== ""
    ) {
      amountPaid = Number(
        body.amount_paid
      );

      if (
        !Number.isFinite(amountPaid) ||
        amountPaid < 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid amount paid.",
          },
          {
            status: 400,
          }
        );
      }
    }

    const customerName =
      body?.customer_name
        ? String(
            body.customer_name
          ).trim()
        : null;

    const customerPhone =
      body?.customer_phone
        ? String(
            body.customer_phone
          ).trim()
        : null;

    // -------------------------------------------------------
    // CALL DATABASE CHECKOUT
    // -------------------------------------------------------

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase.rpc(
        "pos_checkout",
        {
          p_items:
            normalizedItems,

          p_discount:
            discount,

          p_payment_method:
            paymentMethod,

          p_customer_name:
            customerName || null,

          p_customer_phone:
            customerPhone || null,

          p_amount_paid:
            amountPaid,
          
          p_prescription_id:
            prescriptionId,
        }
      );

    // -------------------------------------------------------
    // SUPABASE ERROR
    // -------------------------------------------------------

    if (error) {
      console.error(
        "pos_checkout RPC error:",
        error
      );

      return NextResponse.json(
        {
          success: false,

          error:
            error.message ||
            "POS checkout failed.",

          code:
            error.code || null,
        },
        {
          status: 400,
        }
      );
    }

    // pos_checkout() returns JSONB.
    const result =
      typeof data === "string"
        ? JSON.parse(data)
        : data;

    if (!result) {
      throw new Error(
        "POS checkout returned no result."
      );
    }

    if (result.sale_id) {
      const { data: saleItems, error: saleItemsError } =
        await supabase
          .from("sale_items")
          .select("medicine_name,quantity,unit_price,total,batch_id,batch_no,expiry_date,mrp,discount")
          .eq("sale_id", result.sale_id)
          .order("id", { ascending: true });

      if (!saleItemsError && Array.isArray(saleItems)) {
        result.items = saleItems;
      }
    }
    // -------------------------------------------------------
// ATTACH OPTIONAL PRESCRIPTION TO COMPLETED SALE
// -------------------------------------------------------

if (
  prescriptionId !== null &&
  Number.isInteger(prescriptionId) &&
  prescriptionId > 0 &&
  result?.sale_id
) {
  const { error: prescriptionError } =
    await supabase
      .from("prescriptions")
      .update({
        sale_id: result.sale_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prescriptionId)
      .is("sale_id", null);

  if (prescriptionError) {
    console.error(
      "Prescription attachment error:",
      prescriptionError
    );

    // Do NOT fail the completed sale because of an
    // optional prescription attachment problem.
  }
}
    // -------------------------------------------------------
    // SUCCESS
    // -------------------------------------------------------

    return NextResponse.json(
      result,
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "POS checkout route error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
        }
