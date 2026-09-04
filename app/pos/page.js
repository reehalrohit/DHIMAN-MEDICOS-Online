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
                    <span style={styles.muted}>Batch stock: {item.batch_quantity}</span>
                    <strong>{money(lineTotal)}</strong>
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
                  {value}%
                </button>
              ))}

              <button
                type="button"
                style={styles.discountPreset}
                onClick={() => {
                  setDiscount("");
                  setDiscountType("amount");
                }}
              >
                Clear
              </button>
            </div>

            {safeDiscount > 0 && (
              <small style={styles.discountHint}>
                Applied: {money(safeDiscount)}
              </small>
            )}
          </div>

          <label style={styles.labelNoMargin}>
            Amount Paid
            <input
              type="number"
              min="0"
              step="0.01"
              style={styles.input}
              value={amountPaid}
              placeholder={total.toFixed(2)}
              onChange={(event) => setAmountPaid(event.target.value)}
            />
          </label>
        </div>

        <div style={styles.summary}>
          <div style={styles.summaryRow}><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div style={styles.summaryRow}><span>Discount</span><span>- {money(safeDiscount)}</span></div>
          <div style={styles.totalRow}><strong>Total</strong><strong>{money(total)}</strong></div>
          <div style={styles.summaryRow}><span>Amount Paid</span><span>{money(paid)}</span></div>
          <div style={styles.summaryRow}>
            <span>{balance >= 0 ? "Balance Due" : "Change"}</span>
            <strong>{money(Math.abs(balance))}</strong>
          </div>
        </div>

        <button
          type="button"
          style={{
            ...styles.checkoutButton,
            opacity: checkingOut || cart.length === 0 ? 0.55 : 1,
          }}
          disabled={checkingOut || cart.length === 0}
          onClick={checkout}
        >
          {checkingOut ? "Processing Sale..." : `Complete Sale • ${money(total)}`}
        </button>
      </section>
    </main>
  );
}

const styles = {
  page: { maxWidth: 900, margin: "0 auto", padding: "20px 14px 80px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { marginTop: 4, opacity: 0.6 },
  card: { padding: 16, marginBottom: 16, border: "1px solid #ddd", borderRadius: 16 },
  sectionTitle: { margin: "0 0 14px", fontSize: 20 },
  sectionTitleNoMargin: { margin: 0, fontSize: 20 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  searchInput: { width: "100%", boxSizing: "border-box", padding: 14, fontSize: 16, border: "1px solid #bbb", borderRadius: 12 },
  results: { marginTop: 10, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" },
  result: { width: "100%", padding: 13, border: 0, borderBottom: "1px solid #eee", background: "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" },
  resultLeft: { display: "flex", flexDirection: "column", gap: 3 },
  muted: { fontSize: 13, opacity: 0.65 },
  empty: { padding: "22px 10px", textAlign: "center", opacity: 0.6 },
  cartList: { display: "flex", flexDirection: "column", gap: 12 },
  cartItem: { padding: 13, border: "1px solid #ddd", borderRadius: 12 },
  itemHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  itemFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 14, fontWeight: 600 },
  labelNoMargin: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 },
  discountRow: { display: "flex", gap: 7, alignItems: "stretch" },
  discountType: { minWidth: 105, padding: 11, fontSize: 14, border: "1px solid #bbb", borderRadius: 9, background: "#fff" },
  discountPresets: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 },
  discountPreset: { padding: "6px 10px", border: "1px solid #bbb", borderRadius: 999, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 },
  discountHint: { display: "block", marginTop: 6, fontSize: 12, opacity: 0.7 },
  fieldTitle: { marginBottom: 6, fontSize: 14, fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box", padding: 11, fontSize: 15, border: "1px solid #bbb", borderRadius: 9 },
  twoColumns: { display: "flex", gap: 12, flexWrap: "wrap" },
  quantityBox: { display: "flex", alignItems: "center" },
  quantityButton: { width: 42, height: 42, border: "1px solid #bbb", background: "transparent", fontSize: 20, cursor: "pointer" },
  quantityInput: { width: 65, height: 42, boxSizing: "border-box", borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", borderLeft: 0, borderRight: 0, textAlign: "center", fontSize: 16 },
  removeButton: { width: 34, height: 34, border: 0, borderRadius: 8, fontSize: 22, cursor: "pointer" },
  textButton: { border: 0, background: "transparent", cursor: "pointer", fontWeight: 600 },
  secondaryButton: { padding: "10px 14px", border: "1px solid #bbb", borderRadius: 10, background: "transparent", cursor: "pointer" },
  summary: { marginTop: 18, paddingTop: 12, borderTop: "1px solid #ddd" },
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "6px 0" },
  totalRow: { display: "flex", justifyContent: "space-between", padding: "12px 0", margin: "5px 0", fontSize: 21, borderTop: "1px solid #ddd", borderBottom: "1px solid #ddd" },
  checkoutButton: { width: "100%", padding: 15, marginTop: 16, border: 0, borderRadius: 12, background: "#111", color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer" },
  message: { padding: 12, marginBottom: 15, borderRadius: 10 },
  successMessage: { background: "#e7f6eb", color: "#17652b" },
  errorMessage: { background: "#fdeaea", color: "#a71919" },
  invoiceBox: { padding: 14, marginBottom: 16, border: "1px solid #b8dfc1", borderRadius: 12 },
};
