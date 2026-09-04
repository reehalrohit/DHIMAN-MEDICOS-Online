"use client";
import Link from "next/link";
import {
  useState, useEffect, useRef,
  useMemo, useCallback, memo,
} from "react";

import { CATALOG, WA_NUMBER, allMeds } from "../lib/medicines";
import { SEARCH_ALIASES, QUICK_ASKS, SUGGESTED_MEDICINES } from "../lib/constants";
import { waLink } from "../lib/utils";
import { medicineKey } from "../lib/inventory";
import InstallPrompt from "../components/InstallPrompt";
import "./styles.css";

/* =========================================================
   LAZY SECTION — items only mount when near viewport
   Biggest perf win: 992 items → only visible ones render
========================================================= */
function useLazyVisible(rootMargin = "300px") {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return [ref, visible];
}

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Payment is unavailable."));
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay Checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

function calculateDiscount(subtotal, type, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0 || subtotal <= 0) return 0;

  const rawDiscount = type === "percent"
    ? (subtotal * Math.min(value, 100)) / 100
    : Math.min(value, subtotal);

  return Math.min(subtotal, Math.round(rawDiscount * 100) / 100);
}

/* =========================================================
   CART DRAWER
========================================================= */
const CartDrawer = memo(function CartDrawer({
  cart,
  onClose,
  onAdd,
  onRemove,
  onClear,
  onPosCheckout,
  posLoading,
  onRazorpayCheckout,
  razorpayLoading,
  customerName,
  customerPhone,
  setCustomerName,
  setCustomerPhone,
  discountType,
  discountValue,
  setDiscountType,
  setDiscountValue,
}) {
  const total = cart.reduce(
    (sum, { med, qty }) => sum + med.mrp * qty,
    0
  );

  const totalItems = cart.reduce(
    (sum, item) => sum + item.qty,
    0
  );

  const discountAmount = calculateDiscount(total, discountType, discountValue);
  const grandTotal = Math.max(0, total - discountAmount);

  const selectDiscountType = (type) => {
    setDiscountType(type);
    setDiscountValue("");
  };

  const handleDiscountValue = (event) => {
    const raw = event.target.value;
    if (raw === "") {
      setDiscountValue("");
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    const max = discountType === "percent" ? 100 : total;
    setDiscountValue(String(Math.min(parsed, max)));
  };

  const handleOrder = () => {
    if (!cart.length) return;

    const lines = cart
      .map(
        ({ med, qty }, i) =>
          `${i + 1}. ${med.name} x${qty} — MRP ₹${med.mrp.toFixed(2)}`
      )
      .join("\n");

    const msg =
      `Hi, I want to order from Dhiman Medicos:\n\n` +
      `${lines}\n\n` +
      `Subtotal: ₹${total.toFixed(2)}\n` +
      `Discount: -₹${discountAmount.toFixed(2)}\n` +
      `Total: ₹${grandTotal.toFixed(2)}\n\n` +
      `Please confirm. Thank you!`;

    window.open(
      `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  return (
    <div
      className="cart-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="cart-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          maxHeight: "100dvh",
          minHeight: 0,
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          className="cart-header"
          style={{
            flex: "0 0 auto",
          }}
        >
          <h2>
            🛒 Cart{" "}
            <span className="cart-header-count">
              ({totalItems})
            </span>
          </h2>

          <button
            className="cart-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {!cart.length ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <p>Your cart is empty</p>
            <span>Add medicines to get started</span>
          </div>
        ) : (
          <div
            className="cart-scroll-area"
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
            }}
          >
            <div className="cart-items">
              {cart.map(({ med, qty }) => (
                <div
                  key={med.name}
                  className="cart-item"
                >
                  <div className="cart-item-left">
                    <span className="cart-item-icon">
                      {med.catIcon}
                    </span>

                    <div className="cart-item-info">
                      <div className="cart-item-name">
                        {med.name}
                      </div>

                      <div className="cart-item-price">
                        ₹{med.mrp.toFixed(2)} each
                      </div>

                      {med.quantity !== undefined && (
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            marginTop: "3px",
                          }}
                        >
                          Stock: {med.quantity}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="cart-item-right">
                    <div className="cart-qty">
                      <button
                        onClick={() => onRemove(med)}
                        disabled={posLoading}
                      >
                        −
                      </button>

                      <span>{qty}</span>

                      <button
                        onClick={() => onAdd(med)}
                        disabled={
                          posLoading ||
                          (med.quantity !== undefined &&
                            qty >= med.quantity)
                        }
                      >
                        +
                      </button>
                    </div>

                    <div className="cart-item-total">
                      ₹{(med.mrp * qty).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-footer">
              <div style={{
                border: "1px solid #d6ddd9",
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "12px",
                background: "rgba(7, 95, 70, 0.035)",
              }}>
                <div style={{ fontWeight: 800, marginBottom: "9px" }}>🏷️ Discount</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => selectDiscountType("percent")}
                    disabled={posLoading || razorpayLoading}
                    style={{
                      padding: "9px 8px",
                      borderRadius: "9px",
                      border: `1px solid ${discountType === "percent" ? "#075f46" : "#d6ddd9"}`,
                      background: discountType === "percent" ? "#075f46" : "transparent",
                      color: discountType === "percent" ? "#fff" : "inherit",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    % Percentage
                  </button>
                  <button
                    type="button"
                    onClick={() => selectDiscountType("amount")}
                    disabled={posLoading || razorpayLoading}
                    style={{
                      padding: "9px 8px",
                      borderRadius: "9px",
                      border: `1px solid ${discountType === "amount" ? "#075f46" : "#d6ddd9"}`,
                      background: discountType === "amount" ? "#075f46" : "transparent",
                      color: discountType === "amount" ? "#fff" : "inherit",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ₹ Amount
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                  <input
                    type="number"
                    min="0"
                    max={discountType === "percent" ? 100 : total}
                    step="0.01"
                    inputMode="decimal"
                    value={discountValue}
                    onChange={handleDiscountValue}
                    placeholder={discountType === "percent" ? "Enter discount %" : "Enter discount amount"}
                    disabled={posLoading || razorpayLoading}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #d6ddd9", borderRadius: "9px" }}
                  />
                  <span style={{ fontWeight: 800, minWidth: "52px", textAlign: "right" }}>
                    {discountType === "percent" ? "%" : "₹"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  {[5, 10, 15].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => { setDiscountType("percent"); setDiscountValue(String(preset)); }}
                      disabled={posLoading || razorpayLoading}
                      style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid #cfd8d4", background: "transparent", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {preset}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiscountValue("")}
                    disabled={posLoading || razorpayLoading}
                    style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid #cfd8d4", background: "transparent", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: "5px", marginBottom: "12px" }}>
                <div className="cart-total-row">
                  <span>Subtotal ({totalItems} items)</span>
                  <strong>₹{total.toFixed(2)}</strong>
                </div>
                <div className="cart-total-row">
                  <span>Discount</span>
                  <strong style={{ color: discountAmount > 0 ? "#0b7a4b" : undefined }}>-₹{discountAmount.toFixed(2)}</strong>
                </div>
                <div className="cart-total-row" style={{ borderTop: "1px solid #d6ddd9", paddingTop: "8px", marginTop: "3px" }}>
                  <span>Total</span>
                  <strong>₹{grandTotal.toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ display: "grid", gap: "8px", margin: "12px 0" }}>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #d6ddd9", borderRadius: "10px" }}
                />
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9+ ]/g, "").slice(0, 15))}
                  placeholder="Mobile number"
                  inputMode="tel"
                  autoComplete="tel"
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #d6ddd9", borderRadius: "10px" }}
                />
              </div>

              {/* RAZORPAY */}

              <button
                className="cart-order-btn"
                onClick={onRazorpayCheckout}
                disabled={posLoading || razorpayLoading}
                style={{ background: "#075f46", marginBottom: "10px" }}
              >
                {razorpayLoading ? "⏳ Opening secure payment..." : "💳 Pay Online with Razorpay"}
              </button>

              {/* POS SALE */}

              <button
                className="cart-order-btn"
                onClick={onPosCheckout}
                disabled={posLoading}
                style={{
                  background: "#075f46",
                  marginBottom: "10px",
                }}
              >
                {posLoading
                  ? "⏳ Processing Sale..."
                  : "🧾 Complete POS Sale"}
              </button>

              {/* WHATSAPP */}

              <button
                className="cart-order-btn"
                onClick={handleOrder}
                disabled={posLoading}
              >
                💬 Order All on WhatsApp
              </button>

              <button
                className="cart-clear-btn"
                onClick={onClear}
                disabled={posLoading}
              >
                🗑 Clear Cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
/* =========================================================
   PRODUCT CARD
========================================================= */
const ProductCard = memo(function ProductCard({ med, onOpen, onAddToCart, inCart }) {
  return (
    <div className="p-card" onClick={() => onOpen(med)} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onOpen(med)}>
      <div className="p-icon">{med.catIcon}</div>
      <div className="p-name">{med.name}</div>
      <div className="stock-row">
        <span className={`stock-badge ${med.stock === "In Stock" ? "in" : "out"}`}>
          ● {med.stock}
        </span>
        {med.prescription && <span className="rx-badge">Rx</span>}
      </div>
      <div className="p-mrp-row">
        <span className="p-mrp-lbl">MRP</span>
        <span className="p-mrp">₹{med.mrp.toFixed(2)}</span>
      </div>
      <div className="p-actions">
        <button
          className={`p-cart-btn${inCart ? " in-cart" : ""}`}
          onClick={e => { e.stopPropagation(); onAddToCart(med); }}
          aria-label={inCart ? "Added to cart" : `Add ${med.name} to cart`}
        >{inCart ? "✓ Added" : "+ Cart"}</button>
        <a href={waLink(med.name, med.mrp)} target="_blank" rel="noreferrer"
          className="p-order" onClick={e => e.stopPropagation()}
          aria-label={`Order ${med.name} on WhatsApp`}>🛒 Order</a>
      </div>
    </div>
  );
});

/* =========================================================
   LAZY CATEGORY SECTION
   Placeholder skeleton shown until section scrolls near viewport
========================================================= */
const CategorySection = memo(function CategorySection({ cat, onOpen, onAddToCart, inCart }) {
  const [ref, visible] = useLazyVisible("400px");
  const items = useMemo(() => cat.items.map(item => ({
    ...item, catIcon: cat.icon, catName: cat.name,
    prescription: item.prescription ?? false,
    stock: item.stock || "In Stock",
  })), [cat]);

  return (
    <section ref={ref} id={cat.id} className="section">
      <div className="section-title">
        <h2><span className="cat-icon">{cat.icon}</span> {cat.name}</h2>
        <span>{cat.items.length} items</span>
      </div>
      {visible ? (
        <div className="grid">
          {items.map((med, i) => (
            <ProductCard key={i} med={med} onOpen={onOpen}
              onAddToCart={onAddToCart} inCart={inCart(med)} />
          ))}
        </div>
      ) : (
        <div className="grid skeleton-grid">
          {Array.from({ length: Math.min(cat.items.length, 6) }).map((_, i) => (
            <div key={i} className="p-card skeleton" aria-hidden="true">
              <div className="sk-icon" />
              <div className="sk-name" />
              <div className="sk-badge" />
              <div className="sk-price" />
              <div className="sk-btn" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
});

/* =========================================================
   MEDICINE MODAL
========================================================= */
const MedicineModal = memo(function MedicineModal({ med, onClose, onAddToCart, inCart }) {
  useEffect(() => {
    if (!med) return;
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [med, onClose]);

  if (!med) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-top">
          <div className="modal-icon">{med.catIcon}</div>
          <div><h2>{med.name}</h2><p>{med.catName}</p></div>
        </div>
        <div className="modal-price">₹{med.mrp.toFixed(2)}</div>
        <div className="modal-section"><strong>Usage</strong><p>{med.usage}</p></div>
        <div className="modal-section">
  <strong>Stock</strong>
  <p>
    {med.quantity !== null && med.quantity !== undefined
      ? med.quantity > 0
        ? `In Stock · ${med.quantity} available`
        : "Out of Stock"
      : med.stock}
  </p>
</div>
        {med.prescription && (
          <div className="rx-warning" role="alert">⚠️ Prescription required before purchase.</div>
        )}
        <div className="modal-actions">
          <button className={`modal-cart-btn${inCart ? " in-cart" : ""}`}
            onClick={() => onAddToCart(med)}>
            {inCart ? "✓ In Cart" : "+ Add to Cart"}
          </button>
          <a href={waLink(med.name, med.mrp)} target="_blank" rel="noreferrer"
            className="modal-order">💬 Order on WhatsApp</a>
        </div>
        <button className="modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
});

/* =========================================================
   MAIN PAGE
========================================================= */
export default function Home() {
  const [query, setQuery]               = useState("");
  const [debouncedQuery, setDbQ]        = useState("");
  const [darkMode, setDarkMode]         = useState(false);
  const [selectedMed, setSelectedMed]   = useState(null);
  const [activeId, setActiveId]         = useState(CATALOG[0]?.id || "");
  const [chatOpen, setChatOpen]         = useState(false); // closed on mobile by default
  const [chatInput, setChatInput]       = useState("");
  const [recentlyViewed, setRecent]     = useState([]);
  const [cart, setCart]                 = useState([]);
  const [cartOpen, setCartOpen]         = useState(false);
  const [posLoading, setPosLoading] = useState(false);
  const [razorpayLoading, setRazorpayLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [priceFilter, setPriceFilter]   = useState("all");
  const [rxFilter, setRxFilter]         = useState("all");
  const [chatMessages, setChatMessages] = useState([{
    type: "bot",
    text: "👋 Hello! Ask me about fever, BP, diabetes, cough, pain, stomach issues or medicines.",
  }]);
  const chatEndRef = useRef(null);
const [liveInventory, setLiveInventory] = useState({});
const handlePosCheckout = useCallback(async () => {
  if (!cart.length || posLoading) return;

  const confirmed = window.confirm(
    "Complete this POS sale and deduct stock?"
  );

  if (!confirmed) return;

  try {
    setPosLoading(true);

    const items = cart.map(({ med, qty }) => ({
  medicine_id: medicineKey(med.name),
  medicine_name: med.name,
  quantity: Number(qty),
  unit_price: Number(med.mrp || 0),
}));

    const response = await fetch("/api/pos/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        discount: calculateDiscount(
          cart.reduce((sum, { med, qty }) => sum + Number(med.mrp || 0) * Number(qty), 0),
          discountType,
          discountValue
        ),
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "POS checkout failed");
    }

    alert("✅ POS sale completed successfully!");

    setCart([]);
    setCartOpen(false);
    setDiscountValue("");

    // Reload inventory so new stock appears immediately
    const inventoryResponse = await fetch("/api/inventory", {
      cache: "no-store",
    });

    const inventoryResult = await inventoryResponse.json();

    if (inventoryResponse.ok && inventoryResult.success) {
      const inventoryMap = {};

      for (const item of inventoryResult.inventory || []) {
        inventoryMap[String(item.medicine_id)] = {
          quantity: Number(item.quantity || 0),
          status: item.status || "Out of Stock",
        };
      }

      setLiveInventory(inventoryMap);
    }
  } catch (error) {
    console.error("POS checkout error:", error);

    alert(
      `❌ POS sale failed: ${
        error.message || "Unknown error"
      }`
    );
  } finally {
    setPosLoading(false);
  }
}, [cart, discountType, discountValue, posLoading]);

  const handleRazorpayCheckout = useCallback(async () => {
    if (!cart.length || razorpayLoading || posLoading) return;

    const phone = customerPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      alert("Please enter a valid 10-digit mobile number for the order.");
      return;
    }

    if (cart.some(({ med }) => med.prescription)) {
      alert("Prescription-required medicines cannot be paid online yet. Please send the prescription to Dhiman Medicos on WhatsApp for verification.");
      return;
    }

    try {
      setRazorpayLoading(true);

      const response = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(({ med, qty }) => ({ name: med.name, quantity: Number(qty) })),
          customer_name: customerName.trim(),
          customer_phone: phone,
          discount_type: discountType,
          discount_value: Number(discountValue || 0),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to start payment.");
      }

      await loadRazorpayCheckout();

      const checkout = new window.Razorpay({
        key: result.key_id,
        amount: result.amount,
        currency: result.currency,
        name: "Dhiman Medicos",
        description: "Medicine order",
        order_id: result.order_id,
        prefill: {
          name: result.customer_name || customerName.trim(),
          contact: result.customer_phone || phone,
        },
        notes: {
          store: "Dhiman Medicos",
        },
        theme: { color: "#075f46" },
        handler: async (paymentResponse) => {
          try {
            const verifyResponse = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(paymentResponse),
            });
            const verification = await verifyResponse.json();

            if (!verifyResponse.ok || !verification.success) {
              throw new Error(verification.error || "Payment verification failed.");
            }

            alert(`✅ Payment successful!\nInvoice: ${verification.invoice_number || "created"}`);
            setCart([]);
            setCartOpen(false);
            setDiscountValue("");
            setCustomerName("");
            setCustomerPhone("");

            const inventoryResponse = await fetch("/api/inventory", { cache: "no-store" });
            const inventoryResult = await inventoryResponse.json();
            if (inventoryResponse.ok && inventoryResult.success) {
              const inventoryMap = {};
              for (const item of inventoryResult.inventory || []) {
                inventoryMap[String(item.medicine_id)] = {
                  quantity: Number(item.quantity || 0),
                  status: item.status || "Out of Stock",
                };
              }
              setLiveInventory(inventoryMap);
            }
          } catch (error) {
            console.error("Razorpay verification error:", error);
            alert(`⚠️ Payment was received, but order confirmation needs attention. ${error.message || "Please contact Dhiman Medicos."}`);
          } finally {
            setRazorpayLoading(false);
          }
        },
        modal: {
          ondismiss: () => setRazorpayLoading(false),
        },
      });

      checkout.on("payment.failed", (failure) => {
        console.error("Razorpay payment failed:", failure);
        setRazorpayLoading(false);
        alert(failure?.error?.description || "Payment failed. Please try again.");
      });

      checkout.open();
    } catch (error) {
      console.error("Razorpay checkout error:", error);
      setRazorpayLoading(false);
      alert(`❌ ${error.message || "Unable to start payment."}`);
    }
  }, [cart, customerName, customerPhone, discountType, discountValue, posLoading, razorpayLoading]);

  /* ── Live inventory from Supabase ── */
useEffect(() => {
  let cancelled = false;

  async function loadInventory() {
    try {
      const response = await fetch("/api/inventory", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load inventory");
      }

      if (cancelled) return;

      const inventoryMap = {};

      for (const item of result.inventory || []) {
        inventoryMap[String(item.medicine_id)] = {
          quantity: Number(item.quantity || 0),
          status: item.status || "Out of Stock",
        };
      }

      setLiveInventory(inventoryMap);
    } catch (error) {
      console.error("Inventory load error:", error);
    }
  }

  loadInventory();

  return () => {
    cancelled = true;
  };
}, []);
  const totalMeds  = allMeds.length;
 const withLiveStock = useCallback(
  (medicine) => {
    const key = medicineKey(medicine.name);
    const inventory = liveInventory[key];

    // Supabase is now the source of truth.
    // If a medicine has no inventory record, treat it as unavailable.
    if (!inventory) {
      return {
        ...medicine,
        quantity: 0,
        stock: "Out of Stock",
        inventoryManaged: false,
      };
    }

    const quantity = Math.max(
      0,
      Math.trunc(Number(inventory.quantity) || 0)
    );

    return {
      ...medicine,
      quantity,
      stock: quantity > 0 ? "In Stock" : "Out of Stock",
      inventoryManaged: true,
    };
  },
  [liveInventory]
);

  /* ── Dark mode ── */
  useEffect(() => {
    try { if (localStorage.getItem("darkMode") === "true") setDarkMode(true); } catch(_) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("darkMode", String(darkMode)); } catch(_) {}
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* ── Cart persist ── */
  useEffect(() => {
    try { const s = localStorage.getItem("dmCart"); if (s) setCart(JSON.parse(s)); } catch(_) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("dmCart", JSON.stringify(cart)); } catch(_) {}
  }, [cart]);

  /* ── Recently viewed ── */
  useEffect(() => {
    try { const s = localStorage.getItem("recentMeds"); if (s) setRecent(JSON.parse(s)); } catch(_) {}
  }, []);
  const addRecent = useCallback((med) => {
    setRecent(prev => {
      const u = [med, ...prev.filter(m => m.name !== med.name)].slice(0, 8);
      try { localStorage.setItem("recentMeds", JSON.stringify(u)); } catch(_) {}
      return u;
    });
  }, []);

  /* ── Cart functions ── */
  const addToCart = useCallback((med) => {
    setCart(prev => {
      const ex = prev.find(c => c.med.name === med.name);
      return ex
        ? prev.map(c => c.med.name === med.name ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { med, qty: 1 }];
    });
  }, []);
  const removeFromCart = useCallback((med) => {
    setCart(prev => {
      const ex = prev.find(c => c.med.name === med.name);
      if (!ex) return prev;
      return ex.qty === 1
        ? prev.filter(c => c.med.name !== med.name)
        : prev.map(c => c.med.name === med.name ? { ...c, qty: c.qty - 1 } : c);
    });
  }, []);
  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountValue("");
  }, []);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const inCart    = useCallback(med => cart.some(c => c.med.name === med.name), [cart]);

  /* ── Debounced search ── */
  useEffect(() => {
    const t = setTimeout(() => setDbQ(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  /* ── Filters ── */
  const applyFilters = useCallback((meds) => {
    let f = meds;
    if (priceFilter === "under50")  f = f.filter(m => m.mrp < 50);
    if (priceFilter === "50-200")   f = f.filter(m => m.mrp >= 50 && m.mrp <= 200);
    if (priceFilter === "over200")  f = f.filter(m => m.mrp > 200);
    if (rxFilter === "rx")  f = f.filter(m => m.prescription);
    if (rxFilter === "otc") f = f.filter(m => !m.prescription);
    return f;
  }, [priceFilter, rxFilter]);

  /* ── Search ── */
  const searchResults = useMemo(() => {
  if (!debouncedQuery.trim()) return [];

  const q = debouncedQuery.toLowerCase();

  const matchedBrands = Object.values(SEARCH_ALIASES)
    .filter(({ words }) =>
      words.some(w => q.includes(w) || w.includes(q))
    )
    .flatMap(({ brands }) => brands)
    .map(b => b.toLowerCase());

  const base = allMeds
    .map(withLiveStock)
    .filter(m => {
      const name = m.name.toLowerCase();

      return (
        name.includes(q) ||
        matchedBrands.some(b => name.includes(b))
      );
    })
    .sort(
      (a, b) =>
        (b.name.toLowerCase() === q) -
        (a.name.toLowerCase() === q)
    );

  return applyFilters(base);
}, [
  debouncedQuery,
  applyFilters,
  withLiveStock,
]);

  /* ── Filtered catalog ── */
  const filteredCatalog = useMemo(() => {
  return CATALOG
    .map(cat => ({
      ...cat,

      items: applyFilters(
        cat.items.map(item =>
          withLiveStock({
            ...item,
            catIcon: cat.icon,
            catName: cat.name,
            prescription: item.prescription ?? false,
          })
        )
      ),
    }))
    .filter(cat => cat.items.length > 0);
}, [
  priceFilter,
  rxFilter,
  applyFilters,
  withLiveStock,
]);

  /* ── Chat ── */
  const sendChat = async (text) => {
  const q = (typeof text === "string" ? text : chatInput).trim();

  if (!q) return;

  setChatMessages(m => [
    ...m,
    { type: "user", text: q }
  ]);

  setChatInput("");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: q,
      }),
    });

    const data = await res.json();

    setChatMessages(m => [
      ...m,
      {
        type: "bot",
        text: data.reply || "No response",
      },
    ]);
  } catch (err) {
    console.error("Chat Error:", err);

    setChatMessages(m => [
      ...m,
      {
        type: "bot",
        text: "AI service unavailable.",
      },
    ]);
  }
};

  /* ── Intersection observer for sidebar ── */
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveId(e.target.id); }),
      { threshold: 0.15 }
    );
    CATALOG.forEach(cat => { const el = document.getElementById(cat.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const openMedicine = (med) => { setSelectedMed(med); addRecent(med); };

  return (
    <div className={darkMode ? "dark" : ""}>

      {/* ── HEADER ── */}
      <header className="topbar">
        <div className="mobile-header-top">
          <div className="logo">
            <span className="logo-seal" aria-hidden="true">DM</span>
            <span className="logo-text">Dhiman Medicos</span>
          </div>

          <div className="header-actions">
            <Link
              href="/sales"
              className="sales-btn"
              aria-label="Open Sales History"
            >
              <span className="sales-btn-icon">📋</span>
              <span className="sales-btn-label">Sales History</span>
              <span className="sales-btn-mobile-label">Sales</span>
            </Link>

            <button
              className="cart-btn"
              onClick={() => setCartOpen(true)}
              aria-label={`Cart: ${cartCount} items`}
            >
              🛒{cartCount > 0 && (
                <span className="cart-badge">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>

            <button
              className="toggle"
              onClick={() => setDarkMode(d => !d)}
              aria-label={darkMode ? "Light mode" : "Dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        <input
          className="search"
          placeholder={`🔍 Search ${totalMeds}+ medicines...`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search medicines"
        />
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-content">
          <h1>Dhiman Medicos</h1>
          <p className="hero-sub">Your Trusted Medical Store · Binewal, Hoshiarpur, Punjab</p>
          <div className="hero-stats">
            <div className="stat"><span className="stat-num">{totalMeds}+</span><span className="stat-lbl">Medicines</span></div>
            <div className="stat-divider" />
            <div className="stat"><span className="stat-num">{CATALOG.length}</span><span className="stat-lbl">Categories</span></div>
            <div className="stat-divider" />
            <div className="stat"><span className="stat-num">24/7</span><span className="stat-lbl">WhatsApp</span></div>
          </div>
          <div className="rx-banner">⚠️ Prescription medicines require a valid doctor prescription.</div>
        </div>
      </section>

      {/* ── FILTER BAR ── */}
      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">💰 Price</span>
          {[{id:"all",label:"All"},{id:"under50",label:"Under ₹50"},{id:"50-200",label:"₹50–200"},{id:"over200",label:"₹200+"}]
            .map(f => (
              <button key={f.id}
                className={`filter-chip${priceFilter === f.id ? " active" : ""}`}
                onClick={() => setPriceFilter(f.id)}>{f.label}</button>
            ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">🏥 Type</span>
          {[{id:"all",label:"All"},{id:"otc",label:"OTC"},{id:"rx",label:"Rx Only"}]
            .map(f => (
              <button key={f.id}
                data-tone={f.id === "rx" ? "warn" : undefined}
                className={`filter-chip${rxFilter === f.id ? " active" : ""}`}
                onClick={() => setRxFilter(f.id)}>{f.label}</button>
            ))}
        </div>
        {(priceFilter !== "all" || rxFilter !== "all") && (
          <button className="filter-clear"
            onClick={() => { setPriceFilter("all"); setRxFilter("all"); }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── LAYOUT ── */}
      <div className="layout">
        <aside className="sidebar" role="navigation" aria-label="Medicine categories">
          {CATALOG.map(cat => (
            <a key={cat.id} href={`#${cat.id}`}
              className={activeId === cat.id ? "active" : ""} title={cat.name}>
              <span><span className="cat-icon">{cat.icon}</span> {cat.name}</span>
              <span className="cat-count">{cat.items.length}</span>
            </a>
          ))}
        </aside>

        <main className="products" role="main">
          {/* Recently viewed */}
          {recentlyViewed.length > 0 && (
            <section className="recent">
              <div className="section-title"><h2>🕘 Recently Viewed</h2></div>
              <div className="grid">
                {recentlyViewed.map((med, i) => (
                  <ProductCard key={i} med={med} onOpen={openMedicine}
                    onAddToCart={addToCart} inCart={inCart(med)} />
                ))}
              </div>
            </section>
          )}

          {/* Search results */}
          {query.trim() ? (
            <section className="section">
              <div className="section-title">
                <h2>🔍 Search Results</h2>
                <span>{searchResults.length} found</span>
              </div>
              {searchResults.length === 0 ? (
                <div className="no-results">
                  <div className="no-results-icon">🔍</div>
                  <p>No results for &ldquo;{query}&rdquo;</p>
                  <span>Try one of these:</span>
                  <div className="quick">
                    {SUGGESTED_MEDICINES.map(s => (
                      <span key={s} className="chip" onClick={() => setQuery(s)}
                        role="button" tabIndex={0}>{s}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid">
                  {searchResults.map((med, i) => (
                    <ProductCard key={i} med={med} onOpen={openMedicine}
                      onAddToCart={addToCart} inCart={inCart(med)} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            /* ── LAZY CATEGORY SECTIONS ── */
            filteredCatalog.map(cat => (
              <CategorySection key={cat.id} cat={cat}
                onOpen={openMedicine} onAddToCart={addToCart} inCart={inCart} />
            ))
          )}
        </main>
      </div>

      {/* ── CHAT ── */}
      <div className={`chat ${chatOpen ? "open" : "closed"}`} role="complementary">
        <div className="chat-top">
          <div className="chat-header-content"
            onClick={() => setChatOpen(o => !o)} role="button" tabIndex={0}
            onKeyDown={e => e.key === "Enter" && setChatOpen(o => !o)}
            aria-expanded={chatOpen}>
            🤖 AI Health Assistant
          </div>
                    <button className="chat-minimize" onClick={() => setChatOpen(o => !o)}
            aria-label={chatOpen ? "Minimize" : "Expand"}>
            {chatOpen ? "−" : "+"}
          </button>
        </div>
        {chatOpen && (
          <div className="chat-body">
            <div className="chat-messages">
              {chatMessages.map((m, i) => (
                <div key={i} className={`bubble ${m.type}`}>{m.text}</div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="quick">
              {QUICK_ASKS.map(q => (
                <div key={q.q} className="chip" onClick={() => sendChat(q.q)}
                  role="button" tabIndex={0}>{q.label}</div>
              ))}
            </div>
            <div className="chat-input">
              <input placeholder="Ask anything..." value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                aria-label="Type your question" />
              <button onClick={() => sendChat()}>Send</button>
            </div>
          </div>
        )}
      </div>

      {/* ── FLOATING ── */}
      <div className="floating">
        <a href={`https://wa.me/${WA_NUMBER}`} className="fab"
          target="_blank" rel="noreferrer" aria-label="WhatsApp">💬</a>
        <button className="fab"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top">⬆️</button>
      </div>

      {/* ── CART ── */}
      {cartOpen && (
  <CartDrawer
    cart={cart}
    onClose={() => setCartOpen(false)}
    onAdd={addToCart}
    onRemove={removeFromCart}
    onClear={clearCart}
    onPosCheckout={handlePosCheckout}
    posLoading={posLoading}
    onRazorpayCheckout={handleRazorpayCheckout}
    razorpayLoading={razorpayLoading}
    customerName={customerName}
    customerPhone={customerPhone}
    setCustomerName={setCustomerName}
    setCustomerPhone={setCustomerPhone}
    discountType={discountType}
    discountValue={discountValue}
    setDiscountType={setDiscountType}
    setDiscountValue={setDiscountValue}
  />
)}

      {/* ── MODAL ── */}
      <MedicineModal med={selectedMed} onClose={() => setSelectedMed(null)}
        onAddToCart={addToCart} inCart={selectedMed ? inCart(selectedMed) : false} />

      {/* ── PWA INSTALL PROMPT ── */}
      <InstallPrompt />
    </div>
  );
}
