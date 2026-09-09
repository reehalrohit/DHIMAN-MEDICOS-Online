import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CATALOG } from "../../../lib/medicines";
import { medicineKey } from "../../../lib/inventory";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const UPI_VPA = "dhimanmedicos@upi";

function normalize(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value) {
  return String(value ?? "").replace(/[^0-9+]/g, "").slice(0, 15);
}

function parseExpiry(value) {
  if (!value) return null;
  const text = String(value).trim();

  let match = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(`20${match[3]}`), Number(match[2]) - 1, Number(match[1]));
  }

  match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  return null;
}

function catalogIndex() {
  const map = new Map();

  for (const category of CATALOG || []) {
    for (const medicine of category?.items || []) {
      const name = normalize(medicine?.name);
      const mrp = Number(medicine?.mrp);

      if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;

      const id = medicineKey(name);

      if (!map.has(id)) {
        map.set(id, {
          id,
          name: medicine.name,
          mrp,
          category: category.name,
          prescription: Boolean(medicine.prescription),
        });
      }
    }
  }

  return map;
}

async function getOptionalUser(request) {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();

    if (error || !user) return null;
    return user;
  } catch (error) {
    console.warn(
      "Optional customer authentication unavailable:",
      error?.message || error
    );
    return null;
  }
}

export async function POST(request) {
  let orderId = null;
  let prescriptionIdForCleanup = null;

  try {
    const user = await getOptionalUser(request);
    const body = await request.json();

    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length < 1 || rawItems.length > 30) {
      return NextResponse.json(
        { success: false, error: "Cart is empty or too large." },
        { status: 400 }
      );
    }

    const deliveryMethod =
      body?.delivery_method === "pickup" ? "pickup" : "delivery";

    const requestedPayment = String(body?.payment_method || "").trim();

    const paymentMethod =
      requestedPayment === "upi_manual"
        ? "upi_manual"
        : requestedPayment === "cod"
        ? "cod"
        : "";

    if (!paymentMethod) {
      return NextResponse.json(
        { success: false, error: "Please select a payment method." },
        { status: 400 }
      );
    }

    if (
      deliveryMethod === "delivery" &&
      paymentMethod !== "upi_manual"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Home delivery requires UPI advance payment.",
        },
        { status: 400 }
      );
    }

    const customerName = normalize(body?.customer_name, 120);
    const customerPhone = cleanPhone(body?.customer_phone);
    const customerEmail = normalize(body?.customer_email, 160) || null;

    if (customerName.length < 2) {
      return NextResponse.json(
        { success: false, error: "Please enter your name." },
        { status: 400 }
      );
    }

    if (!/^[0-9+]{10,15}$/.test(customerPhone)) {
      return NextResponse.json(
        {
          success: false,
          error: "Please enter a valid mobile number.",
        },
        { status: 400 }
      );
    }

    if (
      customerEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Please enter a valid email address.",
        },
        { status: 400 }
      );
    }

    let addressLine1 = normalize(body?.address_line1, 200);
    let addressLine2 = normalize(body?.address_line2, 200) || null;
    let landmark = normalize(body?.landmark, 160) || null;
    let city = normalize(body?.city, 80);
    let state = normalize(body?.state, 80) || "Punjab";
    let pincode = normalize(body?.pincode, 6);

    if (deliveryMethod === "pickup") {
      addressLine1 = "Store Pickup";
      addressLine2 = null;
      landmark = null;
      city = "Binewal";
      state = "Punjab";
      pincode = "144523";
    } else if (
      !addressLine1 ||
      !city ||
      !/^[0-9]{6}$/.test(pincode)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter your complete delivery address and 6-digit PIN code.",
        },
        { status: 400 }
      );
    }

    const index = catalogIndex();
    const quantities = new Map();

    for (const item of rawItems) {
      const id = normalize(item?.medicine_id, 120);
      const quantity = Number(item?.quantity);

      if (!index.has(id)) {
        return NextResponse.json(
          {
            success: false,
            error: "One or more cart items are invalid.",
          },
          { status: 400 }
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > 20
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Each medicine quantity must be a whole number from 1 to 20.",
          },
          { status: 400 }
        );
      }

      quantities.set(
        id,
        (quantities.get(id) || 0) + quantity
      );
    }

    const ids = [...quantities.keys()];

    const [
      { data: batches, error: batchError },
      { data: inventory, error: inventoryError },
    ] = await Promise.all([
      supabaseAdmin
        .from("inventory_batches")
        .select("medicine_id,quantity,expiry")
        .in("medicine_id", ids)
        .gt("quantity", 0),

      supabaseAdmin
        .from("inventory")
        .select("medicine_id,quantity")
        .in("medicine_id", ids)
        .gt("quantity", 0),
    ]);

    if (batchError) throw batchError;
    if (inventoryError) throw inventoryError;

    const batchMedicineIds = new Set(
      (batches || []).map((row) => String(row.medicine_id))
    );

    const stock = new Map();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const batch of batches || []) {
      const expiry = parseExpiry(batch.expiry);

      if (expiry && expiry < today) continue;

      const id = String(batch.medicine_id);

      stock.set(
        id,
        (stock.get(id) || 0) + Number(batch.quantity || 0)
      );
    }

    for (const row of inventory || []) {
      const id = String(row.medicine_id);

      if (batchMedicineIds.has(id)) continue;

      stock.set(id, Number(row.quantity || 0));
    }

    let subtotal = 0;
    const items = [];
    let prescriptionRequired = false;

    for (const id of ids) {
      const product = index.get(id);
      const quantity = quantities.get(id);
      const available = Number(stock.get(id) || 0);

      if (available < quantity) {
        return NextResponse.json(
          {
            success: false,
            error:
              `${product.name} is currently unavailable in the requested quantity. ` +
              `Available: ${available}.`,
            medicine_id: id,
            available_quantity: available,
          },
          { status: 409 }
        );
      }

      if (product.prescription) prescriptionRequired = true;

      const lineTotal =
        Math.round(product.mrp * quantity * 100) / 100;

      subtotal += lineTotal;

      items.push({
        medicine_id: id,
        medicine_name: product.name,
        category: product.category,
        quantity,
        unit_price: product.mrp,
        line_total: lineTotal,
      });
    }

    const prescriptionId = body?.prescription_id
      ? Number(body.prescription_id)
      : null;

    if (prescriptionRequired) {
      if (
        !Number.isInteger(prescriptionId) ||
        prescriptionId <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A prescription is required for one or more medicines in your cart.",
          },
          { status: 400 }
        );
      }

      prescriptionIdForCleanup = prescriptionId;

      const {
        data: prescription,
        error: prescriptionError,
      } = await supabaseAdmin
        .from("prescriptions")
        .select("id,status,order_id")
        .eq("id", prescriptionId)
        .maybeSingle();

      if (prescriptionError) throw prescriptionError;

      if (
        !prescription ||
        prescription.order_id ||
        prescription.status === "rejected"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The uploaded prescription cannot be used for this order.",
          },
          { status: 400 }
        );
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const total = subtotal;

    let serviceability = null;
    let deliveryLatitude = null;
    let deliveryLongitude = null;

    if (deliveryMethod === "delivery") {
      deliveryLatitude =
        body?.latitude == null || body?.latitude === ""
          ? null
          : Number(body.latitude);

      deliveryLongitude =
        body?.longitude == null || body?.longitude === ""
          ? null
          : Number(body.longitude);

      if (
        !Number.isFinite(deliveryLatitude) ||
        !Number.isFinite(deliveryLongitude) ||
        deliveryLatitude < -90 ||
        deliveryLatitude > 90 ||
        deliveryLongitude < -180 ||
        deliveryLongitude > 180
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Fresh GPS verification is required for home delivery.",
          },
          { status: 400 }
        );
      }

      const {
        data: serviceabilityResult,
        error: serviceabilityError,
      } = await supabaseAdmin.rpc(
        "check_home_delivery_serviceability",
        {
          p_latitude: deliveryLatitude,
          p_longitude: deliveryLongitude,
          p_order_amount: total,
        }
      );

      if (serviceabilityError) throw serviceabilityError;

      serviceability = serviceabilityResult;

      if (!serviceability?.serviceable) {
        return NextResponse.json(
          {
            success: false,
            error:
              serviceability?.reason ||
              "Home delivery is not available at this location.",
            delivery_distance_km:
              serviceability?.distance_km ?? null,
            max_delivery_distance_km:
              serviceability?.max_distance_km ?? 2,
            minimum_order_amount:
              serviceability?.minimum_order_amount ?? 199,
          },
          { status: 422 }
        );
      }
    }

    const orderNumber =
      `DMO-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "")}-${randomUUID()
        .slice(0, 6)
        .toUpperCase()}`;

    const trackingToken = randomUUID();

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("customer_orders")
        .insert({
          order_number: orderNumber,
          tracking_token: trackingToken,
          user_id: user?.id || null,
          customer_id: user?.id || null,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          address_line1: addressLine1,
          address_line2: addressLine2,
          landmark,
          city,
          state,
          pincode,
          delivery_method: deliveryMethod,
          notes: normalize(body?.notes, 500) || null,
          subtotal,
          discount: 0,
          delivery_fee: 0,
          total,
          payment_method: paymentMethod,
          payment_status: "pending",
          order_status: "pending_review",
          prescription_status: prescriptionRequired
            ? "pending"
            : "not_required",
          prescription_id: prescriptionRequired
            ? prescriptionId
            : null,
          delivery_distance_km:
            deliveryMethod === "delivery"
              ? serviceability?.distance_km ?? null
              : null,
          delivery_latitude:
            deliveryMethod === "delivery"
              ? deliveryLatitude
              : null,
          delivery_longitude:
            deliveryMethod === "delivery"
              ? deliveryLongitude
              : null,
        })
        .select(
          "id,order_number,tracking_token,total,payment_method,payment_status,order_status,prescription_status,prescription_id"
        )
        .single();

    if (orderError) throw orderError;

    orderId = order.id;

    const { error: itemError } =
      await supabaseAdmin
        .from("customer_order_items")
        .insert(
          items.map((item) => ({
            ...item,
            order_id: order.id,
          }))
        );

    if (itemError) throw itemError;

    if (prescriptionRequired) {
      const { error: attachError } =
        await supabaseAdmin
          .from("prescriptions")
          .update({
            order_id: order.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", prescriptionId)
          .is("order_id", null);

      if (attachError) throw attachError;
    }

    const { error: eventError } =
      await supabaseAdmin
        .from("customer_order_events")
        .insert({
          order_id: order.id,
          status: "pending_review",
          note:
            paymentMethod === "upi_manual"
              ? "Customer order received. UPI payment requires manual pharmacy verification."
              : "Customer order received. Payment will be collected at store pickup.",
        });

    if (eventError) throw eventError;

    return NextResponse.json(
      {
        success: true,
        order: {
          ...order,
          items,
          upi:
            paymentMethod === "upi_manual"
              ? {
                  vpa: UPI_VPA,
                  payee_name: "Dhiman Medicos",
                  amount: total,
                  currency: "INR",
                }
              : null,
        },
        tracking_url: `/order/${trackingToken}`,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Online order create error:", error);

    if (orderId) {
      try {
        await supabaseAdmin
          .from("customer_order_events")
          .delete()
          .eq("order_id", orderId);
      } catch (cleanupError) {
        console.error("Order event cleanup error:", cleanupError);
      }

      try {
        await supabaseAdmin
          .from("customer_order_items")
          .delete()
          .eq("order_id", orderId);
      } catch (cleanupError) {
        console.error("Order item cleanup error:", cleanupError);
      }

      if (prescriptionIdForCleanup) {
        try {
          await supabaseAdmin
            .from("prescriptions")
            .update({
              order_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", prescriptionIdForCleanup)
            .eq("order_id", orderId);
        } catch (cleanupError) {
          console.error(
            "Prescription cleanup error:",
            cleanupError
          );
        }
      }

      try {
        await supabaseAdmin
          .from("customer_orders")
          .delete()
          .eq("id", orderId);
      } catch (cleanupError) {
        console.error("Order cleanup error:", cleanupError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to place online order.",
      },
      {
        status: 500,
      }
    );
  }
}
