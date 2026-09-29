"use client";

import { useEffect, useMemo, useState } from "react";

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function parseExpiry(expiry) {
  if (!expiry) return Number.MAX_SAFE_INTEGER;

  const value = String(expiry).trim();
  let match = value.match(/^(\d{2})-(\d{2})-(\d{2})$/);

  if (match) {
    const [, dd, mm, yy] = match;
    return new Date(Number(`20${yy}`), Number(mm) - 1, Number(dd)).getTime();
  }

  match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
  }

  match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
  }

  return Number.MAX_SAFE_INTEGER;
}

function isExpired(expiry) {
  if (!expiry) return false;
  const timestamp = parseExpiry(expiry);
  if (timestamp === Number.MAX_SAFE_INTEGER) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return timestamp < today.getTime();
}

function expiryText(expiry) {
  if (!expiry) return "Expiry N/A";
  return isExpired(expiry) ? `EXPIRED ${expiry}` : `Exp ${expiry}`;
}

export default function POSPage() {
  const [inventory, setInventory] = useState([]);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [lastSale, setLastSale] = useState(null);

  function showError(text) {
    setMessageType("error");
    setMessage(text);
  }

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  async function loadData() {
    try {
      setLoading(true);

      const response = await fetch("/api/pos/inventory", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load POS inventory");
      }

      setInventory(result.inventory || []);
      setBatches(result.batches || []);
    } catch (error) {
      console.error("POS load error:", error);
      showError(error?.message || "Failed to load POS inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const batchesByMedicine = useMemo(() => {
    const map = new Map();

    for (const batch of batches) {
      const medicineId = String(batch.medicine_id);
      if (!map.has(medicineId)) map.set(medicineId, []);
      map.get(medicineId).push(batch);
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          parseExpiry(a.expiry) - parseExpiry(b.expiry) ||
          Number(a.id) - Number(b.id)
      );
    }

    return map;
  }, [batches]);

  function getBatches(medicineId) {
    return (batchesByMedicine.get(String(medicineId)) || []).filter(
      (batch) => Number(batch.quantity || 0) > 0 && !isExpired(batch.expiry)
    );
  }

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];

    return inventory.filter((item) => {
      const name = String(item.medicine_name || "").toLowerCase();
      const id = String(item.medicine_id || "").toLowerCase();
      return name.includes(query) || id.includes(query);
    }).slice(0, 20);
  }, [inventory, search]);

  function addMedicine(medicine) {
    setMessage("");
    setLastSale(null);

    const availableBatches = getBatches(medicine.medicine_id);
    if (!availableBatches.length) {
      showError(`No available batch for ${medicine.medicine_name}`);
      return;
    }

    const batch = availableBatches[0];
    const existingIndex = cart.findIndex(
      (item) =>
        String(item.medicine_id) === String(medicine.medicine_id) &&
        Number(item.batch_id) === Number(batch.id)
    );

    if (existingIndex !== -1) {
      const existing = cart[existingIndex];

      if (Number(existing.quantity) >= Number(batch.quantity)) {
        showError(`Only ${batch.quantity} unit(s) available in batch ${batch.batch_no}`);
        return;
      }

      setCart((current) =>
        current.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: Number(item.quantity) + 1 }
            : item
        )
      );
      setSearch("");
      return;
    }

    const mrp = Number(batch.mrp || medicine.mrp || 0);
    const unitPrice = Number(medicine.selling_price || mrp);

    setCart((current) => [
      ...current,
      {
        inventory_id: medicine.id,
        medicine_id: medicine.medicine_id,
        medicine_name: medicine.medicine_name,
        batch_id: batch.id,
        batch_no: batch.batch_no,
        expiry: batch.expiry,
        mrp,
        unit_price: unitPrice,
        quantity: 1,
        batch_quantity: Number(batch.quantity || 0),
      },
    ]);

    setSearch("");
  }

  function changeBatch(index, batchId) {
    const selectedBatch = batches.find(
      (batch) => Number(batch.id) === Number(batchId)
    );
    if (!selectedBatch) return;

    setCart((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const available = Number(selectedBatch.quantity || 0);

        return {
          ...item,
          batch_id: selectedBatch.id,
          batch_no: selectedBatch.batch_no,
          expiry: selectedBatch.expiry,
          mrp: Number(selectedBatch.mrp || item.mrp || 0),
          batch_quantity: available,
          quantity: Math.max(1, Math.min(Number(item.quantity), available)),
        };
      })
    );
  }

  function updateQuantity(index, quantity) {
    const requested = Number(quantity);
    if (!Number.isInteger(requested)) return;

    setCart((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const maximum = Number(item.batch_quantity || 0);

        return {
          ...item,
          quantity: Math.max(1, Math.min(requested, maximum)),
        };
      })
    );
  }

  function increaseQuantity(index) {
    const item = cart[index];
    if (!item) return;

    if (Number(item.quantity) >= Number(item.batch_quantity)) {
      showError(`Only ${item.batch_quantity} unit(s) available in batch ${item.batch_no}`);
      return;
    }

    updateQuantity(index, Number(item.quantity) + 1);
  }

  function decreaseQuantity(index) {
    const item = cart[index];
    if (!item) return;

    if (Number(item.quantity) <= 1) {
      removeItem(index);
      return;
    }

    updateQuantity(index, Number(item.quantity) - 1);
  }

  function updatePrice(index, value) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;

    setCart((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, unit_price: price } : item
      )
    );
  }

  function removeItem(index) {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearCart() {
    setCart([]);
    setDiscount("");
    setDiscountType("amount");
    setAmountPaid("");
    setCustomerName("");
    setCustomerPhone("");
    setMessage("");
    setLastSale(null);
  }

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0
      ),
    [cart]
  );

  const discountInput = Math.max(0, Number(discount || 0));
  const safeDiscount =
    discountType === "percent"
      ? Math.min(
          subtotal,
          (subtotal * Math.min(100, discountInput)) / 100
        )
      : Math.min(subtotal, discountInput);

  const total = Math.max(0, subtotal - safeDiscount);
  const mrpSubtotal = cart.reduce(
    (sum, item) => sum + Math.max(0, Number(item.mrp || 0)) * Number(item.quantity || 0),
    0
  );
  const itemPriceSavingsTotal = cart.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        (Number(item.mrp || 0) - Number(item.unit_price || 0)) * Number(item.quantity || 0)
      ),
    0
  );
  const totalSaved = itemPriceSavingsTotal + safeDiscount;
  const effectiveDiscountPercent =
    mrpSubtotal > 0 ? (totalSaved / mrpSubtotal) * 100 : 0;
  const billDiscountPercent = subtotal > 0 ? (safeDiscount / subtotal) * 100 : 0;
  const paid = amountPaid === "" ? total : Math.max(0, Number(amountPaid || 0));
  const balance = total - paid;

  async function checkout() {
    try {
      setMessage("");
      setLastSale(null);

      if (!cart.length) throw new Error("Cart is empty");
      if (safeDiscount > subtotal) {
        throw new Error("Discount cannot be greater than subtotal");
      }

      for (const item of cart) {
        if (isExpired(item.expiry)) {
          throw new Error(
            `Expired batch cannot be sold: ${item.medicine_name} • ${item.batch_no || "N/A"}`
          );
        }

        if (Number(item.quantity) > Number(item.batch_quantity)) {
          throw new Error(`Insufficient stock for ${item.medicine_name}`);
        }
      }

      setCheckingOut(true);

      const rpcItems = cart.map((item) => ({
        medicine_id: item.medicine_id,
        batch_id: Number(item.batch_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      }));

      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rpcItems,
          discount: safeDiscount,
          payment_method: paymentMethod,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          amount_paid: paid,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Checkout failed");
      }

      const data = result;

      setLastSale(data);
      showSuccess(`Sale completed — ${data.invoice_number}`);

      setCart([]);
      setDiscount("");
      setAmountPaid("");
      setCustomerName("");
      setCustomerPhone("");

      await loadData();
    } catch (error) {
      console.error("POS checkout error:", error);
      showError(error?.message || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dhiman Medicos POS</h1>
          <div style={styles.subtitle}>Billing & Inventory</div>
          <div style={{ ...styles.muted, marginTop: 3 }}>FEFO enabled • expired batches blocked</div>
        </div>
        <button type="button" style={styles.secondaryButton} onClick={loadData} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div style={{
          ...styles.message,
          ...(messageType === "error" ? styles.errorMessage : styles.successMessage),
        }}>
          {message}
        </div>
      )}

      {lastSale && (
        <div style={styles.invoiceBox}>
          <strong>✓ Invoice created</strong>
          <div>{lastSale.invoice_number}</div>
          <div>Total: {money(lastSale.total)}</div>
        </div>
      )}

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Medicine Search</h2>
        <input
          type="search"
          style={styles.searchInput}
          value={search}
          placeholder="Search medicine name..."
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
        />

        {search.trim() && (
          <div style={styles.results}>
            {filteredInventory.length === 0 ? (
              <div style={styles.empty}>No in-stock medicine found</div>
            ) : (
              filteredInventory.map((medicine) => (
                <button
                  type="button"
                  key={medicine.id}
                  style={styles.result}
                  onClick={() => addMedicine(medicine)}
                >
                  <div style={styles.resultLeft}>
                    <strong>{medicine.medicine_name}</strong>
                    <small style={styles.muted}>Stock: {medicine.quantity}</small>
                    <small style={styles.muted}>Batches: {getBatches(medicine.medicine_id).length}</small>
                  </div>
                  <strong>{money(medicine.selling_price || medicine.mrp)}</strong>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitleNoMargin}>Cart ({cart.length})</h2>
          {cart.length > 0 && (
            <button type="button" style={styles.textButton} onClick={clearCart}>
              Clear Cart
            </button>
          )}
        </div>

        {!cart.length ? (
          <div style={styles.empty}>Search for a medicine and add it to the bill.</div>
        ) : (
          <div style={styles.cartList}>
            {cart.map((item, index) => {
              const availableBatches = getBatches(item.medicine_id);
              const lineTotal = Number(item.quantity) * Number(item.unit_price);
              const lineItemSavings = Math.max(
                0,
                (Number(item.mrp || 0) - Number(item.unit_price || 0)) * Number(item.quantity || 0)
              );
              const lineBillDiscount =
                subtotal > 0 && safeDiscount > 0
                  ? (lineTotal * safeDiscount) / subtotal
                  : 0;
              const lineDiscountAmount = lineItemSavings + lineBillDiscount;
              const lineMrpTotal = Number(item.mrp || 0) * Number(item.quantity || 0);
              const lineDiscountPercent =
                lineMrpTotal > 0
                  ? (lineDiscountAmount / lineMrpTotal) * 100
                  : billDiscountPercent;
              const lineNetTotal = Math.max(0, lineTotal - lineBillDiscount);

              return (
                <div style={styles.cartItem} key={`${item.medicine_id}-${item.batch_id}-${index}`}>
                  <div style={styles.itemHeader}>
                    <div>
                      <strong>{item.medicine_name}</strong>
                      <div style={styles.muted}>MRP {money(item.mrp)}</div>
                    </div>
                    <button type="button" style={styles.removeButton} onClick={() => removeItem(index)} aria-label="Remove item">
                      ×
                    </button>
                  </div>

                  <label style={styles.label}>
                    Batch / Expiry
                    <select style={styles.input} value={item.batch_id} onChange={(event) => changeBatch(index, event.target.value)}>
                      {availableBatches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batch_no || "N/A"} • {expiryText(batch.expiry)} • Qty {batch.quantity}
                        </option>
                      ))}
                    </select>
                    <small style={styles.muted}>FEFO: earliest valid expiry is selected first.</small>
                  </label>

                  <div style={styles.twoColumns}>
                    <div>
                      <div style={styles.fieldTitle}>Quantity</div>
                      <div style={styles.quantityBox}>
                        <button type="button" style={styles.quantityButton} onClick={() => decreaseQuantity(index)}>−</button>
                        <input type="number" style={styles.quantityInput} min="1" max={item.batch_quantity} value={item.quantity} onChange={(event) => updateQuantity(index, event.target.value)} />
                        <button type="button" style={styles.quantityButton} onClick={() => increaseQuantity(index)}>+</button>
                      </div>
                    </div>

                    <label style={styles.labelNoMargin}>
                      Selling Price
                      <input type="number" min="0" step="0.01" style={styles.input} value={item.unit_price} onChange={(event) => updatePrice(index, event.target.value)} />
                    </label>
                  </div>

                  <div style={styles.itemFooter}>
                    <span style={styles.muted}>
                      Batch stock: {item.batch_quantity}
                      {lineDiscountAmount > 0 && (
                        <> • {lineDiscountPercent.toFixed(2)}% off · Saved {money(lineDiscountAmount)}</>
                      )}
                    </span>
                    <strong>{money(lineNetTotal)}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Customer</h2>
        <div style={styles.twoColumns}>
          <label style={styles.labelNoMargin}>
            Name
            <input style={styles.input} value={customerName} placeholder="Optional" onChange={(event) => setCustomerName(event.target.value)} />
          </label>
          <label style={styles.labelNoMargin}>
            Phone
            <input style={styles.input} value={customerPhone} inputMode="tel" placeholder="Optional" onChange={(event) => setCustomerPhone(event.target.value)} />
          </label>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Payment</h2>

        <label style={styles.label}>
          Payment Method
          <select style={styles.input} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="credit">Credit</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>

        <div style={styles.twoColumns}>
          <div style={styles.labelNoMargin}>
            <span>Discount</span>

            <div style={styles.discountRow}>
              <select
                style={styles.discountType}
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
              >
                <option value="amount">₹ Amount</option>
                <option value="percent">% Percent</option>
              </select>

              <input
                type="number"
                min="0"
                max={discountType === "percent" ? 100 : subtotal}
                step="0.01"
                style={styles.input}
                value={discount}
                placeholder={discountType === "percent" ? "0%" : "0.00"}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>

            <div style={styles.discountPresets}>
              {[2, 5, 10, 15, 20].map((value) => (
                <button
                  key={value}
                  type="button"
                  style={styles.discountPreset}
                  onClick={() => {
                    setDiscountType("percent");
                    setDiscount(String(value));
                  }}
                >
     
