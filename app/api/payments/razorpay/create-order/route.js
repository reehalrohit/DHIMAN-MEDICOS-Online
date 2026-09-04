import { NextResponse } from "next/server";
import { CATALOG } from "../../../../../lib/medicines";
import { medicineKey } from "../../../../../lib/inventory";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { getRazorpayConfig, razorpayRequest } from "../../../../../lib/razorpay";

export const dynamic = "force-dynamic";

function normalizeName(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function buildCatalogIndex() {
  const index = new Map();
  for (const category of CATALOG || []) {
    for (const medicine of category?.items || []) {
      const name = normalizeName(medicine?.name);
      const mrp = Number(medicine?.mrp);
      if (!name || !Number.isFinite(mrp) || mrp <= 0 || index.has(name)) continue;
      index.set(name, { name: medicine.name, mrp, medicine_id: medicineKey(medicine.name) });
    }
  }
  return index;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawItems = body?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
      return NextResponse.json({ success: false, error: "Invalid cart." }, { status: 400 });
    }

    const catalog = buildCatalogIndex();
    const catalogById = new Map([...catalog.values()].map((item) => [item.medicine_id, item]));
    const quantities = new Map();

    for (const item of rawItems) {
      const name = normalizeName(item?.name);
      const quantity = Number(item?.quantity);
      const medicine = catalog.get(name);
      if (!medicine) {
        return NextResponse.json({ success: false, error: "One or more medicines are not available for online purchase." }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
        return NextResponse.json({ success: false, error: `Invalid quantity for ${medicine.name}.` }, { status: 400 });
      }
      quantities.set(medicine.medicine_id, (quantities.get(medicine.medicine_id) || 0) + quantity);
    }

    const medicineIds = [...quantities.keys()];
    const { data: inventoryRows, error: inventoryError } = await supabaseAdmin
      .from("inventory")
      .select("medicine_id, medicine_name, quantity")
      .in("medicine_id", medicineIds);
    if (inventoryError) throw inventoryError;

    const inventoryById = new Map((inventoryRows || []).map((row) => [String(row.medicine_id), row]));
    const items = [];
    let amount = 0;

    for (const medicineId of medicineIds) {
      const quantity = quantities.get(medicineId);
      const inventory = inventoryById.get(medicineId);
      const catalogMedicine = catalogById.get(medicineId);

      if (!inventory || !catalogMedicine) {
        return NextResponse.json({ success: false, error: "One or more medicines are currently unavailable." }, { status: 409 });
      }

      const stock = Number(inventory.quantity || 0);
      if (stock < quantity) {
        return NextResponse.json({ success: false, error: `${inventory.medicine_name || catalogMedicine.name} has only ${stock} available.` }, { status: 409 });
      }

      const unitPrice = Number(catalogMedicine.mrp);
      amount += unitPrice * quantity;
      items.push({
        medicine_id: medicineId,
        medicine_name: inventory.medicine_name || catalogMedicine.name,
        quantity,
        unit_price: unitPrice,
      });
    }

    // Discount is calculated here from the server-validated catalog subtotal.
    // Never trust a client-supplied final amount.
    const discountType = String(body?.discount_type || "percent").trim().toLowerCase();
    const discountValue = Number(body?.discount_value ?? 0);

    if (!["percent", "amount"].includes(discountType)) {
      return NextResponse.json({ success: false, error: "Invalid discount type." }, { status: 400 });
    }
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return NextResponse.json({ success: false, error: "Invalid discount value." }, { status: 400 });
    }
    if (discountType === "percent" && discountValue > 100) {
      return NextResponse.json({ success: false, error: "Discount percentage cannot exceed 100%." }, { status: 400 });
    }
    if (discountType === "amount" && discountValue > amount) {
      return NextResponse.json({ success: false, error: "Discount cannot exceed the cart subtotal." }, { status: 400 });
    }

    const rawDiscount = discountType === "percent"
      ? (amount * discountValue) / 100
      : discountValue;
    const discount = Math.min(amount, Math.max(0, Math.round(rawDiscount * 100) / 100));
    const finalAmount = Math.max(0, Math.round((amount - discount) * 100) / 100);
    const amountPaise = Math.round(finalAmount * 100);

    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return NextResponse.json({ success: false, error: "Order amount must be at least ₹1 after discount." }, { status: 400 });
    }

    const customerName = String(body?.customer_name || "").trim().slice(0, 120) || null;
    const customerPhone = String(body?.customer_phone || "").replace(/[^0-9+]/g, "").slice(0, 20) || null;
    const { keyId } = getRazorpayConfig();

    const { data: paymentOrder, error: insertError } = await supabaseAdmin
      .from("payment_orders")
      .insert({ amount_paise: amountPaise, discount, currency: "INR", items, customer_name: customerName, customer_phone: customerPhone, status: "created" })
      .select("id")
      .single();
    if (insertError) throw insertError;

    try {
      const razorpayOrder = await razorpayRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: `DM-${paymentOrder.id.replace(/-/g, "").slice(0, 24)}`,
          notes: { payment_order_id: paymentOrder.id },
        }),
      });

      const { error: updateError } = await supabaseAdmin
        .from("payment_orders")
        .update({ razorpay_order_id: razorpayOrder.id, updated_at: new Date().toISOString() })
        .eq("id", paymentOrder.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        key_id: keyId,
        order_id: razorpayOrder.id,
        amount: amountPaise,
        currency: "INR",
        subtotal: amount,
        discount,
        total: finalAmount,
        customer_name: customerName,
        customer_phone: customerPhone,
      });
    } catch (error) {
      await supabaseAdmin.from("payment_orders").delete().eq("id", paymentOrder.id);
      throw error;
    }
  } catch (error) {
    console.error("Razorpay create-order error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to create payment order." }, { status: 500 });
  }
}
