"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import PrescriptionUploader from "../../components/PrescriptionUploader";

function loadRazorpay() {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Payment unavailable.")
    );
  }

  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );

    if (existing) {
      existing.addEventListener("load", resolve, {
        once: true,
      });
      existing.addEventListener(
        "error",
        () =>
          reject(
            new Error("Unable to load secure payment.")
          ),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () =>
      reject(
        new Error("Unable to load secure payment.")
      );
    document.body.appendChild(script);
  });
}

const statusLabels = {
  pending_review: "Waiting for pharmacy review",
  confirmed: "Order confirmed",
  preparing: "Being prepared",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const money = (value) =>
  `₹${Number(value || 0).toFixed(2)}`;

export default function OnlineOrderPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState({});
  const [openCheckout, setOpenCheckout] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(null);
  const [prescription, setPrescription] =
    useState(null);
  const [deliveryLocation, setDeliveryLocation] =
    useState(null);
  const [locating, setLocating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    address2: "",
    landmark: "",
    city: "Binewal",
    state: "Punjab",
    pincode: "144523",
    notes: "",
    delivery: "delivery",
    payment: "razorpay",
  });

  useEffect(() => {
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        const u = data.user || null;
        setUser(u);

        if (u) {
          setForm((old) => ({
            ...old,
            name:
              old.name ||
              u.user_metadata?.full_name ||
              "",
            phone:
              old.phone ||
              u.user_metadata?.phone ||
              "",
            email:
              u.email || old.email,
          }));
        }
      })
      .catch(() => {});

    try {
      setCart(
        JSON.parse(
          localStorage.getItem("dm-online-cart") ||
            "{}"
        )
      );
    } catch {}

    fetch("/api/online-orders/catalog", {
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          throw new Error(
            data.error ||
              "Unable to load medicines."
          );
        }
        return data;
      })
      .then((data) => setProducts(data.products || []))
      .catch((error) =>
        setMessage(
          error.message ||
            "Unable to load medicines."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "dm-online-cart",
        JSON.stringify(cart)
      );
    } catch {}
  }, [cart]);

  const categories = useMemo(
    () =>
      [
        ...new Map(
          products.map((p) => [
            p.category_id,
            {
              id: p.category_id,
              name: p.category,
            },
          ])
        ).values(),
      ],
    [products]
  );

  const cartItems = useMemo(
    () =>
      products
        .filter((p) => cart[p.id] > 0)
        .map((p) => ({
          ...p,
          quantity: Number(cart[p.id]),
        })),
    [products, cart]
  );

  const totals = useMemo(() => {
    const mrpTotal = cartItems.reduce(
      (sum, p) => sum + p.mrp * p.quantity,
      0
    );

    const discountTotal = cartItems.reduce(
      (sum, p) =>
        sum +
        Number(p.discount_amount || 0) *
          p.quantity,
      0
    );

    const payable = cartItems.reduce(
      (sum, p) =>
        sum +
        Number(p.selling_price || p.mrp) *
          p.quantity,
      0
    );

    return {
      mrpTotal,
      discountTotal,
      payable: Math.round(payable * 100) / 100,
    };
  }, [cartItems]);

  const requiresPrescription = cartItems.some(
    (p) => p.prescription
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "all" ||
            p.category_id === category) &&
          p.name
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [products, category, query]
  );

  function updateQty(product, delta) {
    setCart((old) => {
      const next = { ...old };
      const current = Number(next[product.id] || 0);
      const maximum = Math.min(
        20,
        Number(
          product.available_quantity || 0
        )
      );

      const value = Math.max(
        0,
        Math.min(
          maximum,
          current + delta
        )
      );

      if (value > 0) {
        next[product.id] = value;
      } else {
        delete next[product.id];
      }

      return next;
    });
  }

  function setField(key, value) {
    setForm((old) => ({
      ...old,
      [key]: value,
      ...(key === "delivery" &&
      value === "delivery"
        ? { payment: "razorpay" }
        : {}),
    }));
  }

  function requestDeliveryLocation() {
    if (!navigator.geolocation) {
      setMessage(
        "Location is required for home delivery."
      );
      return;
    }

    setLocating(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "gps",
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setMessage(
          error.code === 1
            ? "Please allow location access to verify the 2 km delivery area."
            : "Unable to get your location. Please try again."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }

  async function placeOrder() {
    setMessage("");

    if (!user) {
      router.push(
        `/login?next=${encodeURIComponent(
          "/online-order"
        )}`
      );
      return;
    }

    if (!cartItems.length) {
      setMessage(
        "Add at least one medicine to your cart."
      );
      return;
    }

    if (
      form.delivery === "delivery" &&
      totals.payable < 199
    ) {
      setMessage(
        "Home delivery requires a minimum order value of ₹199."
      );
      return;
    }

    if (
      form.delivery === "delivery" &&
      !deliveryLocation
    ) {
      requestDeliveryLocation();
      return;
    }

    if (
      requiresPrescription &&
      !prescription
    ) {
      setMessage(
        "Please upload the prescription before placing this order."
      );
      return;
    }

    setPlacing(true);

    try {
      const response = await fetch(
        "/api/online-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: cartItems.map((p) => ({
              medicine_id: p.id,
              quantity: p.quantity,
            })),
            customer_name: form.name,
            customer_phone: form.phone,
            customer_email: form.email,
            address_line1: form.address,
            address_line2: form.address2,
            landmark: form.landmark,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            notes: form.notes,
            delivery_method: form.delivery,
            payment_method: form.payment,
            delivery_latitude:
              deliveryLocation?.latitude || null,
            delivery_longitude:
              deliveryLocation?.longitude || null,
            prescription_id:
              prescription?.id || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Unable to place order."
        );
      }

      if (
        form.payment === "razorpay"
      ) {
        await loadRazorpay();

        // Razorpay WebView-safe flow:
        // callback_url + redirect=true.
        const callbackUrl =
          `${window.location.origin}/api/online-orders/payment/callback`;

        const razorpay =
          new window.Razorpay({
            key:
              data.order.razorpay.key_id,
            amount:
              data.order.razorpay.amount,
            currency: "INR",
            name: "Dhiman Medicos",
            description:
              `Online order ${data.order.order_number}`,
            order_id:
              data.order.razorpay.order_id,
            callback_url: callbackUrl,
            redirect: true,
            prefill: {
              name: form.name,
              contact: form.phone,
              email:
                form.email || undefined,
            },
            theme: {
              color: "#075f46",
            },
            modal: {
              ondismiss: () =>
                setMessage(
                  "Payment window closed. Your order remains awaiting payment confirmation."
                ),
            },
          });

        razorpay.open();
        return;
      }

      setCart({});
      setSuccess({
        ...data.order,
        payment_status: "pending",
      });
      setOpenCheckout(false);
    } catch (error) {
      setMessage(
        error?.message ||
          "Unable to place order."
      );
    } finally {
      setPlacing(false);
    }
  }

  if (success) {
    return (
      <main style={s.page}>
        <div style={s.success}>
          <div style={s.check}>✓</div>
          <div style={s.kicker}>
            DHIMAN MEDICOS
          </div>
          <h1>Order received</h1>
          <p style={s.muted}>
            Order{" "}
            <strong>
              {success.order_number}
            </strong>{" "}
            has been recorded.
          </p>

          <div style={s.box}>
            <div style={s.boxRow}>
              <span>Status</span>
              <strong>
                {
                  statusLabels[
                    success.order_status
                  ]
                }
              </strong>
            </div>
            <div style={s.boxRow}>
              <span>Total</span>
              <strong>
                {money(success.total)}
              </strong>
            </div>
            <div style={s.boxRow}>
              <span>Payment</span>
              <strong>
                {success.payment_status ===
                "paid"
                  ? "Paid online"
                  : "Pay on pickup"}
              </strong>
            </div>
          </div>

          {success.prescription_status ===
            "pending" && (
            <div style={s.notice}>
              📋 Prescription submitted. The
              pharmacist will review it before
              confirming the order.
            </div>
          )}

          <Link
            href={success.tracking_url}
            style={s.primary}
          >
            Track your order
          </Link>

          <button
            onClick={() => setSuccess(null)}
            style={s.secondary}
          >
            Continue shopping
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <div style={s.kicker}>
            DHIMAN MEDICOS
          </div>
          <h1 style={s.title}>
            Order Medicines Online
          </h1>
          <p style={s.muted}>
            Browse medicines, see eligible
            generic discounts, add to cart,
            and send your order to the
            pharmacy.
          </p>
        </div>

        <div style={s.navRow}>
          {user ? (
            <Link
              href="/account"
              style={s.secondarySmall}
            >
              My Account
            </Link>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(
                "/online-order"
              )}`}
              style={s.secondarySmall}
            >
              Sign in
            </Link>
          )}

          <Link
            href="/"
            style={s.secondarySmall}
          >
            ← Storefront
          </Link>
        </div>
      </header>

      <section style={s.search}>
        <input
          value={query}
          onChange={(e) =>
            setQuery(e.target.value)
          }
          placeholder="Search medicines…"
          style={s.input}
        />
        <button
          onClick={() => {
            if (!user) {
              router.push(
                `/login?next=${encodeURIComponent(
                  "/online-order"
                )}`
              );
              return;
            }
            setOpenCheckout(true);
          }}
          disabled={!cartItems.length}
          style={s.cart}
        >
          🛒 Cart (
          {cartItems.reduce(
            (n, p) => n + p.quantity,
            0
          )}
          ) · {money(totals.payable)}
        </button>
      </section>

      <section style={s.chips}>
        <button
          onClick={() => setCategory("all")}
          style={
            category === "all"
              ? s.active
              : s.chip
          }
        >
          All
        </button>

        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              setCategory(c.id)
            }
            style={
              category === c.id
                ? s.active
                : s.chip
            }
          >
            {c.name}
          </button>
        ))}
      </section>

      {message && (
        <div style={s.alert}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={s.loading}>
          Loading medicines…
        </div>
      ) : (
        <section style={s.grid}>
          {filtered.map((p) => (
            <article
              key={p.id}
              style={s.card}
            >
              <div style={s.icon}>
                {p.category_icon}
              </div>

              <div style={s.name}>
                {p.name}
              </div>

              <div style={s.meta}>
                {p.category}
                {p.prescription
                  ? " · Rx"
                  : ""}
              </div>

              {p.in_stock ? (
                <div style={s.stock}>
                  ● In stock
                  {p.available_quantity
                    ? ` · ${p.available_quantity} available`
                    : ""}
                </div>
              ) : (
                <div style={s.oos}>
                  ● Currently unavailable
                </div>
              )}

              {p.discount_amount > 0 ? (
                <div style={s.priceBlock}>
                  <span style={s.mrp}>
                    {money(p.mrp)}
                  </span>
                  <span style={s.discount}>
                    −
                    {p.discount_percent}%
                  </span>
                </div>
              ) : null}

              <div style={s.price}>
                {money(p.selling_price)}
              </div>

              {p.in_stock && (
                <div style={s.qtyRow}>
                  <button
                    onClick={() =>
                      updateQty(p, -1)
                    }
                    style={s.qty}
                  >
                    −
                  </button>

                  <span>
                    {cart[p.id] || 0}
                  </span>

                  <button
                    onClick={() =>
                      updateQty(p, 1)
                    }
                    style={s.qty}
                  >
                    +
                  </button>
                </div>
              )}
            </article>
          ))}

          {!filtered.length && (
            <div style={s.empty}>
              No medicines found. Try another
              search or category.
            </div>
          )}
        </section>
      )}

      {openCheckout && (
        <div
          style={s.overlay}
          onClick={() =>
            !placing &&
            setOpenCheckout(false)
          }
        >
          <div
            style={s.modal}
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div style={s.modalHead}>
              <div>
                <div style={s.kicker}>
                  CHECKOUT
                </div>
                <h2 style={{ margin: 0 }}>
                  Delivery details
                </h2>
              </div>

              <button
                onClick={() =>
                  !placing &&
                  setOpenCheckout(false)
                }
                style={s.close}
              >
                ✕
              </button>
            </div>

            <div style={s.summary}>
              {cartItems.map((p) => (
                <div
                  key={p.id}
                  style={s.summaryRow}
                >
                  <span>
                    {p.name} ×{" "}
                    {p.quantity}
                  </span>
                  <strong>
                    {money(
                      Number(
                        p.selling_price ||
                          p.mrp
                      ) * p.quantity
                    )}
                  </strong>
                </div>
              ))}

              <div
                style={{
                  ...s.summaryRow,
                  borderTop:
                    "1px solid #ddd",
                  paddingTop: 10,
                  marginTop: 8,
                }}
              >
                <strong>MRP total</strong>
                <strong>
                  {money(totals.mrpTotal)}
                </strong>
              </div>

              {totals.discountTotal >
                0 && (
                <div
                  style={{
                    ...s.summaryRow,
                    color: "#0e7b4a",
                  }}
                >
                  <strong>
                    Generic discount
                  </strong>
                  <strong>
                    −
                    {money(
                      totals.discountTotal
                    )}
                  </strong>
                </div>
              )}

              <div
                style={{
                  ...s.summaryRow,
                  fontSize: 16,
                }}
              >
                <strong>
                  Payable
                </strong>
                <strong>
                  {money(
                    totals.payable
                  )}
                </strong>
              </div>
            </div>

            <div style={s.formGrid}>
              <input
                placeholder="Full name"
                value={form.name}
                onChange={(e) =>
                  setField(
                    "name",
                    e.target.value
                  )
                }
                style={s.input}
              />

              <input
                placeholder="Mobile number"
                inputMode="tel"
                value={form.phone}
                onChange={(e) =>
                  setField(
                    "phone",
                    e.target.value
                  )
                }
                style={s.input}
              />

              <input
                placeholder="Email (optional)"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setField(
                    "email",
                    e.target.value
                  )
                }
                style={s.input}
              />

              <div style={s.radio}>
                <label>
                  <input
                    type="radio"
                    checked={
                      form.delivery ===
                      "delivery"
                    }
                    onChange={() =>
                      setField(
                        "delivery",
                        "delivery"
                      )
                    }
                  />{" "}
                  Home delivery
                </label>

                <label>
                  <input
                    type="radio"
                    checked={
                      form.delivery ===
                      "pickup"
                    }
                    onChange={() =>
                      setField(
                        "delivery",
                        "pickup"
                      )
                    }
                  />{" "}
                  Store pickup
                </label>
              </div>

              {form.delivery ===
                "delivery" && (
                <>
                  <input
                    placeholder="Address"
                    value={form.address}
                    onChange={(e) =>
                      setField(
                        "address",
                        e.target.value
                      )
                    }
                    style={s.input}
                  />

                  <input
                    placeholder="Address line 2 (optional)"
                    value={
                      form.address2
                    }
                    onChange={(e) =>
                      setField(
                        "address2",
                        e.target.value
                      )
                    }
                    style={s.input}
                  />

                  <input
                    placeholder="Landmark (optional)"
                    value={
                      form.landmark
                    }
                    onChange={(e) =>
                      setField(
                        "landmark",
                        e.target.value
                      )
                    }
                    style={s.input}
                  />

                  <div style={s.two}>
                    <input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) =>
                        setField(
                          "city",
                          e.target.value
                        )
                      }
                      style={s.input}
                    />

                    <input
                      placeholder="PIN code"
                      inputMode="numeric"
                      value={
                        form.pincode
                      }
                      onChange={(e) =>
                        setField(
                          "pincode",
                          e.target.value
                        )
                      }
                      style={s.input}
                    />
                  </div>

                  <div style={s.locationBox}>
                    <strong>
                      📍 Delivery area
                    </strong>
                    <span>
                      Delivery is limited
                      to 2 km from the
                      pharmacy.
                    </span>

                    <button
                      onClick={
                        requestDeliveryLocation
                      }
                      disabled={locating}
                      style={
                        s.secondary
                      }
                    >
                      {locating
                        ? "Getting location…"
                        : deliveryLocation
                        ? "Location verified"
                        : "Verify my location"}
                    </button>

                    {deliveryLocation && (
                      <small>
                        GPS accuracy:{" "}
                        {Math.round(
                          deliveryLocation.accuracy ||
                            0
                        )}
                        m
                      </small>
                    )}
                  </div>
                </>
              )}

              <textarea
                placeholder="Notes for the pharmacy (optional)"
                value={form.notes}
                onChange={(e) =>
                  setField(
                    "notes",
                    e.target.value
                  )
                }
                style={{
                  ...s.input,
                  minHeight: 80,
                }}
              />

              <div style={s.payment}>
                <strong>
                  Payment
                </strong>

                {form.delivery ===
                "delivery" ? (
                  <>
                    <div
                      style={{
                        fontSize: 13,
                        color:
                          "#0e5938",
                        fontWeight:
                          700,
                      }}
                    >
                      🚚 Home delivery:
                      online advance
                      payment only.
                    </div>

                    <label>
                      <input
                        type="radio"
                        checked={
                          form.payment ===
                          "razorpay"
                        }
                        onChange={() =>
                          setField(
                            "payment",
                            "razorpay"
                          )
                        }
                      />{" "}
                      Pay online with
                      Razorpay
                    </label>

                    <div
                      style={{
                        fontSize: 12,
                        color:
                          "#6b756f",
                      }}
                    >
                      Minimum order:
                      ₹199.
                    </div>
                  </>
                ) : (
                  <>
                    <label>
                      <input
                        type="radio"
                        checked={
                          form.payment ===
                          "cod"
                        }
                        onChange={() =>
                          setField(
                            "payment",
                            "cod"
                          )
                        }
                      />{" "}
                      Pay on pickup
                    </label>

                    <label>
                      <input
                        type="radio"
                        checked={
                          form.payment ===
                          "razorpay"
                        }
                        onChange={() =>
                          setField(
                            "payment",
                            "razorpay"
                          )
                        }
                      />{" "}
                      Pay online with
                      Razorpay
                    </label>
                  </>
                )}
              </div>
            </div>

            {requiresPrescription && (
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <PrescriptionUploader
                  prescription={
                    prescription
                  }
                  onChange={
                    setPrescription
                  }
                  disabled={placing}
                />
              </div>
            )}

            {message && (
              <div
                style={{
                  ...s.alert,
                  marginTop: 14,
                }}
              >
                {message}
              </div>
            )}

            <button
              onClick={placeOrder}
              disabled={
                placing ||
                !cartItems.length ||
                (form.delivery ===
                  "delivery" &&
                  (totals.payable <
                    199 ||
                    !deliveryLocation ||
                    form.payment !==
                      "razorpay"))
              }
              style={{
                ...s.primary,
                marginTop: 14,
                opacity:
                  placing ||
                  !cartItems.length
                    ? 0.6
                    : 1,
              }}
            >
              {placing
                ? "Processing…"
                : form.payment ===
                  "razorpay"
                ? `Pay ${money(
                    totals.payable
                  )} & place order`
                : "Place order"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#faf7f0",
    color: "#16241b",
    fontFamily:
      "Inter,system-ui,sans-serif",
    padding: "24px 16px 60px",
  },
  header: {
    maxWidth: 1200,
    margin: "0 auto 18px",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  navRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  kicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 2,
    color: "#0e5938",
  },
  title: {
    fontSize:
      "clamp(2rem,5vw,3rem)",
    margin: "4px 0 8px",
    letterSpacing: "-.03em",
  },
  muted: {
    color: "#657168",
    lineHeight: 1.6,
  },
  search: {
    maxWidth: 1200,
    margin: "0 auto 12px",
    display: "flex",
    gap: 10,
  },
  input: {
    width: "100%",
    border:
      "1px solid #d9ded7",
    borderRadius: 12,
    padding:
      "12px 13px",
    fontSize: 14,
    background: "#fffdf9",
    boxSizing: "border-box",
  },
  cart: {
    whiteSpace: "nowrap",
    border: 0,
    borderRadius: 12,
    padding: "0 17px",
    background: "#0e5938",
    color: "white",
    fontWeight: 800,
  },
  chips: {
    maxWidth: 1200,
    margin: "0 auto 20px",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    border:
      "1px solid #d8ded8",
    background: "#fffdf9",
    color: "#57625b",
  },
  active: {
    padding: "8px 12px",
    borderRadius: 999,
    border:
      "1px solid #0e5938",
    background: "#0e5938",
    color: "white",
    fontWeight: 800,
  },
  grid: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill,minmax(210px,1fr))",
    gap: 13,
  },
  card: {
    background: "#fffdf9",
    border:
      "1px solid #e7e0cf",
    borderRadius: 16,
    padding: 17,
    boxShadow:
      "0 3px 12px rgba(11,42,28,.05)",
  },
  icon: { fontSize: 28 },
  name: {
    fontWeight: 800,
    marginTop: 7,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: 12,
    color: "#7a837c",
    marginTop: 4,
  },
  stock: {
    fontSize: 12,
    marginTop: 10,
    color: "#0e7b4a",
  },
  oos: {
    fontSize: 12,
    marginTop: 10,
    color: "#a33f34",
  },
  priceBlock: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  mrp: {
    textDecoration:
      "line-through",
    color: "#8b938d",
    fontSize: 14,
  },
  discount: {
    color: "#0e7b4a",
    fontWeight: 800,
    fontSize: 12,
  },
  price: {
    fontWeight: 900,
    fontSize: 20,
    marginTop: 6,
  },
  qtyRow: {
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    border:
      "1px solid #d8ded8",
    borderRadius: 11,
    padding: 4,
  },
  qty: {
    width: 36,
    height: 34,
    borderRadius: 8,
    background: "#edf5ef",
    fontSize: 20,
    border: 0,
  },
  alert: {
    maxWidth: 1200,
    margin: "0 auto 15px",
    padding: 12,
    borderRadius: 12,
    background: "#fff0ee",
    border:
      "1px solid #e9b6af",
    color: "#a33f34",
  },
  loading: {
    maxWidth: 1200,
    margin: "50px auto",
    textAlign: "center",
    color: "#6f7a70",
  },
  empty: {
    gridColumn: "1 / -1",
    padding: 28,
    textAlign: "center",
    border:
      "1px solid #e7e0cf",
    borderRadius: 16,
    background: "#fffdf9",
    color: "#6f7a70",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(0,0,0,.48)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    zIndex: 1000,
  },
  modal: {
    width:
      "min(760px,100%)",
    maxHeight: "92dvh",
    overflowY: "auto",
    background: "#fffdf9",
    borderRadius:
      "22px 22px 0 0",
    padding: 22,
    boxSizing: "border-box",
  },
  modalHead: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    marginBottom: 16,
  },
  close: {
    fontSize: 22,
    padding: 4,
    border: 0,
    background: "transparent",
  },
  summary: {
    border:
      "1px solid #e5e1d6",
    borderRadius: 14,
    padding: 13,
    marginBottom: 15,
  },
  summaryRow: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 12,
    padding: "5px 0",
    fontSize: 14,
  },
  formGrid: {
    display: "grid",
    gap: 10,
  },
  radio: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
    padding: "3px 0",
  },
  two: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 10,
  },
  locationBox: {
    padding: 13,
    borderRadius: 13,
    background: "#f2f6f3",
    border:
      "1px solid #d7e3db",
    display: "grid",
    gap: 7,
  },
  payment: {
    display: "grid",
    gap: 8,
    padding: 13,
    borderRadius: 13,
    background: "#f2f6f3",
  },
  primary: {
    display: "inline-flex",
    justifyContent:
      "center",
    alignItems: "center",
    width: "100%",
    padding: "13px 16px",
    borderRadius: 12,
    border: 0,
    background: "#0e5938",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
  },
  secondary: {
    display: "inline-flex",
    justifyContent:
      "center",
    alignItems: "center",
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border:
      "1px solid #d8ded8",
    background: "#fffdf9",
    fontWeight: 800,
  },
  secondarySmall: {
    display: "inline-flex",
    justifyContent:
      "center",
    alignItems: "center",
    padding: "11px 14px",
    borderRadius: 12,
    border:
      "1px solid #d8ded8",
    background: "#fffdf9",
    fontWeight: 800,
    textDecoration: "none",
    color: "inherit",
  },
  success: {
    maxWidth: 560,
    margin: "8vh auto",
    background: "#fffdf9",
    border:
      "1px solid #e7e0cf",
    borderRadius: 22,
    padding: 28,
    boxShadow:
      "0 14px 45px rgba(11,42,28,.1)",
  },
  check: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#eaf6ee",
    color: "#0e7b4a",
    fontSize: 30,
    fontWeight: 900,
  },
  box: {
    display: "grid",
    gap: 10,
    background: "#f2f6f3",
    borderRadius: 14,
    padding: 15,
    margin: "17px 0",
  },
  boxRow: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 12,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    background: "#fff6e8",
    color: "#7d5620",
    marginBottom: 15,
  },
};

