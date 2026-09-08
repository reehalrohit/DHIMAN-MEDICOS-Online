import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CATALOG } from "../../../lib/medicines";
import { medicineKey } from "../../../lib/inventory";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { getRazorpayConfig, razorpayRequest } from "../../../lib/razorpay";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const STORE_LATITUDE = 31.2847197;
const STORE_LONGITUDE = 76.2614544;
const DELIVERY_RADIUS_KM = 2;
const MIN_DELIVERY_ORDER = 199;

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => Number(v) * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value) {
  return String(value ?? "")
    .replace(/[^0-9+]/g, "")
    .slice(0, 15);
}

function parseExpiry(value) {
  if (!value) return null;
  const t = String(value).trim();

  let m = t.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(`20${m[3]}`), Number(m[2]) - 1, Number(m[1]));

  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

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

function activeGenericDiscount(mrp, offer, now) {
  if (!offer?.is_generic || !offer?.active) return 0;
  if (offer.starts_at && new Date(offer.starts_at) > now) return 0;
  if (offer.ends_at && new Date(offer.ends_at) < now) return 0;

  const value = Math.max(0, Number(offer.discount_value || 0));

  const raw =
    offer.discount_type === "flat"
      ? value
      : (mrp * value) / 100;

  return Math.round(
    Math.min(mrp, Math.max(0, raw)) * 100
  ) / 100;
}

export async function POST(request) {
  let orderId = null;

  try {
    const authResponse = NextResponse.next();

    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              authResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Please sign in before placing an online order.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length < 1 || rawItems.length > 30) {
      return NextResponse.json(
        {
          success: false,
          error: "Cart is empty or too large.",
        },
        { status: 400 }
      );
    }

    const deliveryMethod =
      body?.delivery_method === "pickup" ? "pickup" : "delivery";

    const paymentMethod =
      body?.payment_method === "razorpay" ? "razorpay" : "cod";

    if (
      deliveryMethod === "delivery" &&
      paymentMethod !== "razorpay"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Home delivery requires online advance payment.",
        },
        { status: 400 }
      );
    }

    const customerName = normalize(body?.customer_name, 120);
    const customerPhone = cleanPhone(body?.customer_phone);
    const customerEmail =
      normalize(body?.customer_email, 160) || null;

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

    const deliveryLatitude = Number(body?.delivery_latitude);
    const deliveryLongitude = Number(body?.delivery_longitude);

    let deliveryDistanceKm = null;

    if (deliveryMethod === "pickup") {
      addressLine1 = "Store Pickup";
      addressLine2 = null;
      landmark = null;
      city = "Binewal";
      state = "Punjab";
      pincode = "144523";
    } else {
      if (
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
              "Please allow location access to verify the 2 km delivery area.",
          },
          { status: 400 }
        );
      }

      deliveryDistanceKm = distanceKm(
        STORE_LATITUDE,
        STORE_LONGITUDE,
        deliveryLatitude,
        deliveryLongitude
      );

      if (deliveryDistanceKm > DELIVERY_RADIUS_KM) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Sorry, home delivery is available only within 2 km of Dhiman Medicos.",
          },
          { status: 400 }
        );
      }
    }

    const index = catalogIndex();
    const now = new Date();

    const [
      { data: regulatoryRows, error: regulatoryError },
      { data: offers, error: offerError },
      { data: batches, error: batchError },
      { data: inventory, error: inventoryError },
    ] = await Promise.all([
      supabaseAdmin
        .from("medicine_regulatory_classification")
        .select("medicine_id,schedule,nrx"),
      supabaseAdmin
        .from("medicine_offer_rules")
        .select(
          "medicine_id,is_generic,discount_type,discount_value,active,starts_at,ends_at"
        ),
      supabaseAdmin
        .from("inventory_batches")
        .select("medicine_id,quantity,expiry")
        .gt("quantity", 0),
      supabaseAdmin
        .from("inventory")
        .select("medicine_id,quantity")
        .gt("quantity", 0),
    ]);

    if (regulatoryError) throw regulatoryError;
    if (offerError) throw offerError;
    if (batchError) throw batchError;
    if (inventoryError) throw inventoryError;

    const regulatoryMap = new Map(
      (regulatoryRows || []).map((row) => [
        String(row.medicine_id),
        row,
      ])
    );

    const offerMap = new Map(
      (offers || []).map((row) => [
        String(row.medicine_id),
        row,
      ])
    );

    const batchIds = new Set(
      (batches || []).map((r) => String(r.medicine_id))
    );

    const stock = new Map();

    for (const batch of batches || []) {
      const expiry = parseExpiry(batch.expiry);
      if (expiry && expiry < new Date(new Date().setHours(0, 0, 0, 0))) {
        continue;
      }

      const id = String(batch.medicine_id);
      stock.set(
        id,
        (stock.get(id) || 0) + Number(batch.quantity || 0)
      );
    }

    for (const row of inventory || []) {
      const id = String(row.medicine_id);
      if (batchIds.has(id)) continue;

      const quantity = Number(row.quantity || 0);
      if (quantity > 0) stock.set(id, quantity);
    }

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

      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 20) {
        return NextResponse.json(
          {
            success: false,
            error: "Each medicine quantity must be a whole number from 1 to 20.",
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
    const items = [];
    let subtotal = 0;
    let prescriptionRequired = false;

    for (const id of ids) {
      const product = index.get(id);
      const quantity = quantities.get(id);
      const available = Number(stock.get(id) || 0);

      // This is the exact same sellable-stock calculation used by /catalog.
      if (available < quantity) {
        return NextResponse.json(
          {
            success: false,
            error:
              available > 0
                ? `${product.name}: only ${available} available, but ${quantity} requested.`
                : `${product.name} is currently unavailable.`,
            available_quantity: available,
            medicine_id: id,
          },
          { status: 409 }
        );
      }

      const regulation = regulatoryMap.get(id);
      const schedule = regulation?.schedule || null;
      const nrx = Boolean(regulation?.nrx);

      if (Boolean(schedule) || nrx || product.prescription) {
        prescriptionRequired = true;
      }

      const offer = offerMap.get(id);
      const discount = activeGenericDiscount(
        product.mrp,
        offer,
        now
      );

      const unitPrice =
        Math.round((product.mrp - discount) * 100) / 100;

      const lineTotal =
        Math.round(unitPrice * quantity * 100) / 100;

      subtotal += lineTotal;

      items.push({
        medicine_id: id,
        medicine_name: product.name,
        category: product.category,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        mrp: product.mrp,
        discount: Math.round(discount * quantity * 100) / 100,
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
              "A valid prescription is required for one or more medicines in your cart.",
          },
          { status: 400 }
        );
      }

      const {
        data: prescription,
        error: prescriptionError,
      } = await supabaseAdmin
        .from("prescriptions")
        .select("id,status,order_id,user_id")
        .eq("id", prescriptionId)
        .maybeSingle();

      if (prescriptionError) throw prescriptionError;

      if (
        !prescription ||
        prescription.order_id ||
        prescription.user_id !== user.id ||
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

    if (
      deliveryMethod === "delivery" &&
      total < MIN_DELIVERY_ORDER
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Home delivery requires a minimum order value of ₹${MIN_DELIVERY_ORDER}.`,
        },
        { status: 400 }
      );
    }

    const orderNumber =
      `DMO-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "")}-${randomUUID()
        .slice(0, 6)
        .toUpperCase()}`;

    const trackingToken = randomUUID();

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin
      .from("customer_orders")
      .insert({
        order_number: orderNumber,
        tracking_token: trackingToken,
        user_id: user.id,
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
        delivery_distance_km: deliveryDistanceKm,
        delivery_latitude:
          deliveryMethod === "delivery"
            ? deliveryLatitude
            : null,
        delivery_longitude:
          deliveryMethod === "delivery"
            ? deliveryLongitude
            : null,
        payment_status: "pending",
        order_status: "pending_review",
        prescription_status: prescriptionRequired
          ? "pending"
          : "not_required",
        prescription_id: prescriptionRequired
          ? prescriptionId
          : null,
      })
      .select(
        "id,order_number,tracking_token,total,payment_method,prescription_status"
      )
      .single();

    if (orderError) throw orderError;

    orderId = order.id;

    const {
      error: itemError,
    } = await supabaseAdmin
      .from("customer_order_items")
      .insert(
        items.map((item) => ({
          ...item,
          order_id: order.id,
        }))
      );

    if (itemError) throw itemError;

    if (prescriptionRequired) {
      const {
        error: attachError,
      } = await supabaseAdmin
        .from("prescriptions")
        .update({
          order_id: order.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prescriptionId)
        .is("order_id", null);

      if (attachError) throw attachError;
    }

    const {
      error: eventError,
    } = await supabaseAdmin
      .from("customer_order_events")
      .insert({
        order_id: order.id,
        status: "pending_review",
        note: "Customer order received.",
      });

    if (eventError) throw eventError;

    if (paymentMethod === "razorpay") {
      const { keyId } = getRazorpayConfig();

      const razorpayOrder = await razorpayRequest(
        "/orders",
        {
          method: "POST",
          body: JSON.stringify({
            amount: Math.round(total * 100),
            currency: "INR",
            receipt: orderNumber,
            notes: {
              customer_order_id: order.id,
            },
          }),
        }
      );

      const {
        error: razorpayUpdateError,
      } = await supabaseAdmin
        .from("customer_orders")
        .update({
          razorpay_order_id: razorpayOrder.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (razorpayUpdateError) throw razorpayUpdateError;

      return NextResponse.json({
        success: true,
        order: {
          ...order,
          razorpay: {
            key_id: keyId,
            order_id: razorpayOrder.id,
            amount: Math.round(total * 100),
            currency: "INR",
          },
          items,
        },
        tracking_url: `/order/${trackingToken}`,
      });
    }

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        items,
      },
      tracking_url: `/order/${trackingToken}`,
    });
  } catch (error) {
    console.error("Online order create error:", error);

    if (orderId) {
      await supabaseAdmin
        .from("customer_orders")
        .delete()
        .eq("id", orderId);
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to place online order.",
      },
      { status: 500 }
    );
  }
}
