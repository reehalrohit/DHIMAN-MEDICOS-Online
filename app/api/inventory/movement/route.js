import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import {
  STOCK_MOVEMENT,
  getStockStatus,
} from "../../../../lib/inventory";

export const dynamic = "force-dynamic";

/**
 * POST /api/inventory/movement
 *
 * Body:
 * {
 *   medicineId: "SOLVIN-COLD-SYP-60ML",
 *   type: "purchase",
 *   quantity: 5,
 *   note: "New stock"
 * }
 *
 * quantity is always sent as a positive whole number.
 * The API decides whether it should add or subtract stock
 * according to movement type.
 */
export async function POST(request) {
  try {
    const body = await request.json();

    const medicineId = String(body.medicineId || "").trim();
    const type = String(body.type || "").trim();
    const quantity = Number(body.quantity);
    const referenceId = body.referenceId
      ? String(body.referenceId)
      : null;
    const note = body.note ? String(body.note) : "";

    if (!medicineId) {
      return NextResponse.json(
        {
          success: false,
          error: "medicineId is required",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Quantity must be a positive whole number",
        },
        { status: 400 }
      );
    }

    const allowedTypes = Object.values(STOCK_MOVEMENT);

    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid movement type: ${type}`,
        },
        { status: 400 }
      );
    }

    // Get current inventory record.
    const { data: inventory, error: inventoryError } =
      await supabaseAdmin
        .from("inventory")
        .select("*")
        .eq("medicine_id", medicineId)
        .maybeSingle();

    if (inventoryError) {
      throw inventoryError;
    }

    if (!inventory) {
      return NextResponse.json(
        {
          success: false,
          error: "Medicine does not exist in inventory",
        },
        { status: 404 }
      );
    }

    const currentQuantity = Number(inventory.quantity || 0);

    /*
     * Movements that increase inventory.
     */
    const increaseTypes = [
      STOCK_MOVEMENT.OPENING,
      STOCK_MOVEMENT.PURCHASE,
      STOCK_MOVEMENT.SALE_RETURN,
    ];

    /*
     * Movements that decrease inventory.
     */
    const decreaseTypes = [
      STOCK_MOVEMENT.SALE,
      STOCK_MOVEMENT.PURCHASE_RETURN,
      STOCK_MOVEMENT.DAMAGED,
      STOCK_MOVEMENT.EXPIRED,
    ];

    let change;

    if (increaseTypes.includes(type)) {
      change = quantity;
    } else if (decreaseTypes.includes(type)) {
      change = -quantity;
    } else if (type === STOCK_MOVEMENT.ADJUSTMENT) {
      /*
       * For now adjustments are treated as stock-in.
       * We can add explicit +/- adjustment controls later.
       */
      change = quantity;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported movement type",
        },
        { status: 400 }
      );
    }

    const nextQuantity = currentQuantity + change;

    // Never allow negative inventory.
    if (nextQuantity < 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient stock. Available: ${currentQuantity}, requested: ${quantity}`,
        },
        { status: 409 }
      );
    }

    const lowStockAt = Number(inventory.low_stock_at ?? 5);

    const status = getStockStatus(
      nextQuantity,
      lowStockAt
    );

    // Update inventory.
    const { data: updatedInventory, error: updateError } =
      await supabaseAdmin
        .from("inventory")
        .update({
          quantity: nextQuantity,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("medicine_id", medicineId)
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }

    // Record movement history.
    const { data: movement, error: movementError } =
      await supabaseAdmin
        .from("stock_movements")
        .insert({
          medicine_id: medicineId,
          medicine_name:
            inventory.medicine_name ||
            inventory.name ||
            medicineId,
          type,
          quantity: change,
          reference_id: referenceId,
          note,
        })
        .select()
        .single();

    if (movementError) {
      /*
       * Inventory was already updated, so report the problem
       * instead of pretending the entire operation succeeded.
       *
       * We'll make inventory + movement fully atomic with a
       * PostgreSQL function before POS checkout.
       */
      return NextResponse.json(
        {
          success: false,
          error:
            "Stock changed but movement history could not be recorded",
          inventory: updatedInventory,
          details: movementError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,

      previousQuantity: currentQuantity,
      change,
      quantity: nextQuantity,
      status,

      inventory: updatedInventory,
      movement,
    });
  } catch (error) {
    console.error("Inventory movement error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to process inventory movement",
      },
      { status: 500 }
    );
  }
      }
