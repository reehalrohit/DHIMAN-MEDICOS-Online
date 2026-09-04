/**
 * Inventory domain helpers for Dhiman Medicos.
 *
 * Phase 1 intentionally has no UI or database side effects. These helpers form
 * the single inventory contract that the POS/database layer will use later.
 */

export const STOCK_STATUS = Object.freeze({
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
});

export const STOCK_MOVEMENT = Object.freeze({
  OPENING: "opening",
  PURCHASE: "purchase",
  SALE: "sale",
  SALE_RETURN: "sale_return",
  PURCHASE_RETURN: "purchase_return",
  ADJUSTMENT: "adjustment",
  DAMAGED: "damaged",
  EXPIRED: "expired",
});

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function medicineKey(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.trunc(quantity));
}

export function getStockStatus(quantity, lowStockAt = DEFAULT_LOW_STOCK_THRESHOLD) {
  const stock = normalizeQuantity(quantity);
  const threshold = Math.max(0, Math.trunc(Number(lowStockAt) || 0));

  if (stock === 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (stock <= threshold) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

export function createInventoryRecord(medicine, options = {}) {
  if (!medicine?.name) throw new Error("Medicine name is required");

  const quantity = normalizeQuantity(options.quantity ?? medicine.quantity ?? 0);
  const lowStockAt = normalizeQuantity(
    options.lowStockAt ?? medicine.lowStockAt ?? DEFAULT_LOW_STOCK_THRESHOLD
  );

  return {
    medicineId: options.medicineId || medicine.id || medicineKey(medicine.name),
    name: medicine.name,
    quantity,
    lowStockAt,
    status: getStockStatus(quantity, lowStockAt),
  };
}

export function validateStockChange(currentQuantity, change) {
  const current = normalizeQuantity(currentQuantity);
  const delta = Number(change);

  if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
    throw new Error("Stock change must be a whole number");
  }

  const next = current + delta;
  if (next < 0) {
    throw new Error(`Insufficient stock. Available: ${current}, requested: ${Math.abs(delta)}`);
  }

  return next;
}

export function applyStockChange(record, change) {
  if (!record) throw new Error("Inventory record is required");

  const quantity = validateStockChange(record.quantity, change);
  const lowStockAt = normalizeQuantity(
    record.lowStockAt ?? DEFAULT_LOW_STOCK_THRESHOLD
  );

  return {
    ...record,
    quantity,
    lowStockAt,
    status: getStockStatus(quantity, lowStockAt),
  };
}

export function createStockMovement({
  medicineId,
  medicineName,
  type,
  quantity,
  referenceId = null,
  note = "",
}) {
  const amount = Number(quantity);

  if (!medicineId) throw new Error("medicineId is required");
  if (!Object.values(STOCK_MOVEMENT).includes(type)) {
    throw new Error(`Invalid stock movement type: ${type}`);
  }
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("Movement quantity must be a non-zero whole number");
  }

  return {
    medicineId,
    medicineName: medicineName || "",
    type,
    quantity: amount,
    referenceId,
    note,
    createdAt: new Date().toISOString(),
  };
}
