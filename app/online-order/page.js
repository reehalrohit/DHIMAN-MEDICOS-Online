"use client");

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PrescriptionUploader from "../../components/PrescriptionUploader";

const UPI_VPA = "dhimanmedicos@upi";
const WEBSITE_URL =
  "https://dhiman-medicos-online.vercel.app";

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

function upiLink(orderNumber, amount) {
  const params = new URLSearchParams({
    pa: UPI_VPA,
    pn: "Dhiman Medicos",
    am: Number(amount).toFixed(2),
    cu: "INR",
    tn: `Order ${orderNumber}`,
  });

  return `upi://pay?${params.toString()}`;
}

export default function OnlineOrderPage() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState({});
  const [openCheckout, setOpenCheckout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [location, setLocation] = useState(null);

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
    payment: "upi_manual",
  });

  useEffect(() => {
    try {
      setCart(
        JSON.parse(
          localStorage.getItem("dm-online-cart") || "{}"
        )
      );
    } catch {
      setCart({});
    }

    fetch("/api/online-orders/catalog", {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              "Unable to load medicines."
          );
        }

        setProducts(data.products || []);
      })
      .catch((error) => {
        setMessage(
          error.message ||
            "Unable to load medicines."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "dm-online-cart",
        JSON.stringify(cart)
      );
    } catch {
      // Ignore storage failures.
    }
  }, [cart]);

  const categories = useMemo(() => {
    return [
      ...new Map(
        products.map((product) => [
          product.category_id,
          {
            id: product.category_id,
            name: product.category,
          },
        ])
      ).values(),
    ];
  }, [products]);

  const cartItems = useMemo(() => {
    return products
      .filter(
        (product) =>
          Number(cart[product.id] || 0) > 0
      )
      .map((product) => ({
        ...product,
        quantity: Number(cart[product.id]),
      }));
  }, [products, cart]);

  const total = cartItems.reduce(
    (sum, product) =>
      sum +
      Number(product.mrp) *
        Number(product.quantity),
    0
  );

  const requiresPrescription = cartItems.some(
    (product) => Boolean(product.prescription)
  );

  const filtered = useMemo(() => {
    const search = query
      .trim()
      .toLowerCase();

    return products.filter(
      (product) =>
        (category === "all" ||
          product.category_id === category) &&
        product.name
          .toLowerCase()
          .includes(search)
    );
  }, [products, category, query]);

  function setField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateQty(product, delta) {
    setCart((current) => {
      const next = { ...current };

      const quantity = Math.max(
        0,
        Math.min(
          20,
          Number(next[product.id] || 0) +
            delta
        )
      );

      if (quantity > 0) {
        next[product.id] = quantity;
      } else {
        delete next[product.id];
      }

      return next;
    });
  }

  function getCurrentLocation() {
    setMessage("");

    if (!navigator.geolocation) {
      setMessage(
        "Your browser does not support GPS location."
      );
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy:
            position.coords.accuracy,
        });

        setLocating(false);

        setMessage(
          "GPS location captured. The server will verify whether your address is within the 2 km delivery area."
        );
      },
      (error) => {
        setLocating(false);

        if (error.code === 1) {
          setMessage(
            "Please allow location access to verify home delivery."
          );
        } else if (error.code === 2) {
          setMessage(
            "Your location could not be determined. Please try again."
          );
        } else if (error.code === 3) {
          setMessage(
            "Location request timed out. Please try again."
          );
        } else {
          setMessage(
            "Unable to get your current location."
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function placeOrder() {
    setMessage("");

    if (!cartItems.length) {
      setMessage(
        "Add at least one medicine to your cart."
      );
      return;
    }

    if (
      form.delivery === "delivery" &&
      total < 199
    ) {
      setMessage(
        "Home delivery requires a minimum order value of ₹199."
      );
      return;
    }

    if (
      form.delivery === "delivery" &&
      !location
    ) {
      setMessage(
        "Please verify your delivery location using GPS."
      );
      return;
    }

    if (
      form.delivery === "delivery" &&
      !form.address.trim()
    ) {
      setMessage(
        "Please enter your delivery address."
      );
      return;
    }

    if (
      !form.name.trim() ||
      form.name.trim().length < 2
    ) {
      setMessage(
        "Please enter your full name."
      );
      return;
    }

    const cleanPhone = String(
      form.phone || ""
    ).replace(/[^0-9+]/g, "");

    if (
      !/^[0-9+]{10,15}$/.test(
        cleanPhone
      )
    ) {
      setMessage(
        "Please enter a valid mobile number."
      );
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

    if (
      form.delivery === "delivery" &&
      form.payment !== "upi_manual"
    ) {
      setMessage(
        "Home delivery requires UPI advance payment."
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
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            items: cartItems.map(
              (product) => ({
                medicine_id:
                  product.id,
                quantity:
                  product.quantity,
              })
            ),

            customer_name:
              form.name.trim(),

            customer_phone:
              cleanPhone,

            customer_email:
              form.email.trim(),

            address_line1:
              form.address.trim(),

            address_line2:
              form.address2.trim(),

            landmark:
              form.landmark.trim(),

            city:
              form.city.trim(),

            state:
              form.state.trim(),

            pincode:
              form.pincode.trim(),

            notes:
              form.notes.trim(),

            delivery_method:
              form.delivery,

            payment_method:
              form.payment,

            prescription_id:
              prescription?.id || null,

            latitude:
              form.delivery ===
              "delivery"
                ? location?.latitude
                : null,

            longitude:
              form.delivery ===
              "delivery"
                ? location?.longitude
                : null,
          }),
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Unable to place order."
        );
      }

      setCart({});
      setPrescription(null);
      setLocation(null);
      setOpenCheckout(false);

      setSuccess({
        ...data.order,
        tracking_url:
          data.tracking_url,
        payment_status:
          data.order?.payment_status ||
          "pending",
        upi_link:
          data.order?.upi
            ? upiLink(
                data.order
                  .order_number,
                data.order.total
              )
            : null,
      });
    } catch (error) {
      setMessage(
        error.message ||
          "Unable to place order."
      );
    } finally {
      setPlacing(false);
    }
  }

  if (success) {
    return (
      <main style={styles.page}>
        <div style={styles.success}>
          <div style={styles.check}>
            ✓
          </div>

          <div style={styles.kicker}>
            DHIMAN MEDICOS
          </div>

          <h1>Order received</h1>

          <p style={styles.muted}>
            Order{" "}
            <strong>
              {success.order_number}
            </strong>{" "}
            has been recorded.
          </p>

          <div style={styles.box}>
            <div>
              <span>Status</span>
              <strong>
                {statusLabels[
                  success.order_status
                ] ||
                  success.order_status}
              </strong>
            </div>

            <div>
              <span>Total</span>
              <strong>
                ₹
                {Number(
                  success.total
                ).toFixed(2)}
              </strong>
            </div>

            <div>
              <span>Payment</span>
              <strong>
                {success.payment_status ===
                "paid"
                  ? "Paid"
                  : "UPI payment pending confirmation"}
              </strong>
            </div>
          </div>

          {success.payment_status !==
            "paid" &&
            success.upi_link && (
              <div
                style={
                  styles.notice
                }
              >
                <strong>
                  Pay ₹
                  {Number(
                    success.total
                  ).toFixed(2)}{" "}
                  by UPI
                </strong>

                <div
                  style={{
                    marginTop: 6,
                  }}
                >
                  UPI ID:{" "}
                  <b>
                    {UPI_VPA}
                  </b>
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 8,
                    marginTop: 10,
                    flexWrap:
                      "wrap",
                  }}
                >
                  <a
                    href={
                      success.upi_link
                    }
                    style={
                      styles.primary
                    }
                  >
                    Open UPI app
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        UPI_VPA
                      )
                    }
                    style={
                      styles.secondary
                    }
                  >
                    Copy UPI ID
                  </button>
                </div>

                <small
                  style={{
                    display:
                      "block",
                    marginTop: 8,
                  }}
                >
                  After payment, the
                  pharmacy will manually
                  verify the transaction
                  and accept the order.
                </small>
              </div>
            )}

          {success.prescription_status ===
            "pending" && (
            <div
              style={
                styles.notice
              }
            >
              📋 Prescription submitted.
              The pharmacist will review it
              before confirming the order.
            </div>
          )}

          <Link
            href={
              success.tracking_url
            }
            style={
              styles.primary
            }
          >
            Track your order
          </Link>

          <button
            type="button"
            onClick={() =>
              setSuccess(null)
            }
            style={
              styles.secondary
            }
          >
            Continue shopping
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>
            DHIMAN MEDICOS
          </div>

          <h1 style={styles.title}>
            Order Medicines Online
          </h1>

          <p style={styles.muted}>
            Browse available medicines,
            add them to your cart, and send
            the order to the pharmacy.
          </p>

          <div
            style={
              styles.deliveryBanner
            }
          >
            <strong>
              🏠 Home delivery within 2 km
            </strong>

            <span>
              Minimum order ₹199
            </span>
          </div>
        </div>

        <Link
          href="/"
          style={
            styles.secondarySmall
          }
        >
          ← Storefront
        </Link>
      </header>

      <section style={styles.search}>
        <input
          value={query}
          onChange={(event) =>
            setQuery(
              event.target.value
            )
          }
          placeholder="Search medicines…"
          style={styles.input}
        />

        <button
          type="button"
          onClick={() =>
            setOpenCheckout(true)
          }
          disabled={
            !cartItems.length
          }
          style={styles.cart}
        >
          🛒 Cart (
          {cartItems.reduce(
            (count, product) =>
              count +
              product.quantity,
            0
          )}
          ) · ₹
          {total.toFixed(2)}
        </button>
      </section>

      <section style={styles.chips}>
        <button
          type="button"
          onClick={() =>
            setCategory("all")
          }
          style={
            category === "all"
              ? styles.active
              : styles.chip
          }
        >
          All
        </button>

        {categories.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() =>
              setCategory(
                item.id
              )
            }
            style={
              category === item.id
                ? styles.active
                : styles.chip
            }
          >
            {item.name}
          </button>
        ))}
      </section>

      {message && (
        <div style={styles.alert}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={styles.loading}>
          Loading medicines…
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          No medicines found.
        </div>
      ) : (
        <section style={styles.grid}>
          {filtered.map((product) => (
            <article
              key={product.id}
              style={styles.card}
            >
              <div style={styles.icon}>
                {product.category_icon ||
                  "💊"}
              </div>

              <div style={styles.name}>
                {product.name}
              </div>

              <div style={styles.meta}>
                {product.category}
                {product.prescription
                  ? " · Rx"
                  : ""}
              </div>

              <div style={styles.stock}>
                {product.in_stock
                  ? "● In stock"
                  : "● Currently unavailable"}
              </div>

              <div style={styles.price}>
                ₹
                {Number(
                  product.mrp
                ).toFixed(2)}
              </div>

              {product.in_stock && (
                <div
                  style={
                    styles.qtyRow
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      updateQty(
                        product,
                        -1
                      )
                    }
                    style={
                      styles.qty
                    }
                  >
                    −
                  </button>

                  <span>
                    {cart[
                      product.id
                    ] || 0}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      updateQty(
                        product,
                        1
                      )
                    }
                    style={
                      styles.qty
                    }
                  >
                    +
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {openCheckout && (
        <div
          style={styles.overlay}
          onClick={() =>
            !placing &&
            setOpenCheckout(false)
          }
        >
          <div
            style={styles.modal}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={
                styles.modalHead
              }
            >
              <div>
                <div
                  style={
                    styles.kicker
                  }
                >
                  CHECKOUT
                </div>

                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  Delivery details
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  !placing &&
                  setOpenCheckout(
                    false
                  )
                }
                style={styles.close}
              >
                ✕
              </button>
            </div>

            <div
              style={
                styles.summary
              }
            >
              {cartItems.map(
                (product) => (
                  <div
                    key={
                      product.id
                    }
                    style={
                      styles.summaryRow
                    }
                  >
                    <span>
                      {
                        product.name
                      }{" "}
                      ×{" "}
                      {
                        product.quantity
                      }
                    </span>

                    <strong>
                      ₹
                      {(
                        Number(
                          product.mrp
                        ) *
                        Number(
                          product.quantity
                        )
                      ).toFixed(
                        2
                      )}
                    </strong>
                  </div>
                )
              )}

              <div
                style={{
                  ...styles.summaryRow,
                  borderTop:
                    "1px solid #ddd",
                  paddingTop: 10,
                  marginTop: 8,
                }}
              >
                <strong>
                  Total
                </strong>

                <strong>
                  ₹
                  {total.toFixed(
                    2
                  )}
                </strong>
              </div>
            </div>

            <div
              style={
                styles.formGrid
              }
            >
              <input
                placeholder="Full name"
                value={
                  form.name
                }
                onChange={(event) =>
                  setField(
                    "name",
                    event.target
                      .value
                  )
                }
                style={styles.input}
              />

              <input
                placeholder="Mobile number"
                inputMode="tel"
                value={
                  form.phone
                }
                onChange={(event) =>
                  setField(
                    "phone",
                    event.target
                      .value
                  )
                }
                style={styles.input}
              />

              <input
                placeholder="Email (optional)"
                type="email"
                value={
                  form.email
                }
                onChange={(event) =>
                  setField(
                    "email",
                    event.target
                      .value
                  )
                }
                style={styles.input}
              />

              <div
                style={
                  styles.radio
                }
              >
                <label>
                  <input
                    type="radio"
                    checked={
                      form.delivery ===
                      "delivery"
                    }
                    onChange={() => {
                      setField(
                        "delivery",
                        "delivery"
                      );
                      setMessage(
                        ""
                      );
                    }}
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
                    onChange={() => {
                      setField(
                        "delivery",
                        "pickup"
                      );
                      setLocation(
                        null
                      );
                      setMessage(
                        ""
                      );
                    }}
                  />{" "}
                  Store pickup
                </label>
              </div>

              {form.delivery ===
                "delivery" && (
                <>
                  <section
                    style={
                      styles.location
                    }
                  >
                    <strong>
                      📍 Home delivery
                      service area
                    </strong>

                    <p
                      style={
                        styles.hint
                      }
                    >
                      Delivery is available
                      within 2 km of the
                      physical Dhiman Medicos
                      store. Minimum order
                      ₹199.
                    </p>

                    <button
                      type="button"
                      onClick={
                        getCurrentLocation
                      }
                      disabled={
                        locating ||
                        placing
                      }
                      style={
                        styles.secondary
                      }
                    >
                      {locating
                        ? "Getting GPS location…"
                        : location
                        ? "✓ GPS location captured"
                        : "Verify my delivery location"}
                    </button>

                    {location && (
                      <div
                        style={
                          styles.gpsSuccess
                        }
                      >
                        GPS captured.
                        Final serviceability
                        is verified by the
                        server.
                      </div>
                    )}
                  </section>

                  <input
                    placeholder="Address"
                    value={
                      form.address
                    }
                    onChange={(event) =>
                      setField(
                        "address",
                        event.target
                          .value
                      )
                    }
                    style={styles.input}
                  />

                  <input
                    placeholder="Address line 2 (optional)"
                    value={
                      form.address2
                    }
                    onChange={(event) =>
                      setField(
                        "address2",
                        event.target
                          .value
                      )
                    }
                    style={styles.input}
                  />

                  <input
                    placeholder="Landmark (optional)"
                    value={
                      form.landmark
                    }
                    onChange={(event) =>
                      setField(
                        "landmark",
                        event.target
                          .value
                      )
                    }
                    style={styles.input}
                  />

                  <div
                    style={styles.two}
                  >
                    <input
                      placeholder="City"
                      value={
                        form.city
                      }
                      onChange={(event) =>
                        setField(
                          "city",
                          event.target
                            .value
                        )
                      }
                      style={styles.input}
                    />

                    <input
                      placeholder="PIN code"
                      inputMode="numeric"
                      maxLength={6}
                      value={
                        form.pincode
                      }
                      onChange={(event) =>
                        setField(
                          "pincode",
                          event.target
                            .value
                            .replace(
                              /[^0-9]/g,
                              ""
                            )
                        )
                      }
                      style={styles.input}
                    />
                  </div>
                </>
              )}

              <textarea
                placeholder="Notes for the pharmacy (optional)"
                value={
                  form.notes
                }
                onChange={(event) =>
                  setField(
                    "notes",
                    event.target
                      .value
                  )
                }
                style={{
                  ...styles.input,
                  minHeight: 80,
                  resize: "vertical",
                }}
              />

              <div
                style={
                  styles.payment
                }
              >
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
                      🚚 Home delivery
                      requires advance
                      UPI payment.
                    </div>

                    <label>
                      <input
                        type="radio"
                        checked={
                          form.payment ===
                          "upi_manual"
                        }
                        onChange={() =>
                          setField(
                            "payment",
                            "upi_manual"
                          )
                        }
                      />{" "}
                      Pay by UPI ·{" "}
                      {
                        UPI_VPA
                      }
                    </label>
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
                          "upi_manual"
                        }
                        onChange={() =>
                          setField(
                            "payment",
                            "upi_manual"
                          )
                        }
                      />{" "}
                      Pay by UPI ·{" "}
                      {
                        UPI_VPA
                      }
                    </label>
                  </>
                )}
              </div>

              {requiresPrescription && (
                <PrescriptionUploader
                  prescription={
                    prescription
                  }
                  onChange={
                    setPrescription
                  }
                  disabled={
                    placing
                  }
                />
              )}

              <button
                type="button"
                onClick={
                  placeOrder
                }
                disabled={
                  placing ||
                  (form.delivery ===
                    "delivery" &&
                    !location)
                }
                style={{
                  ...styles.primary,
                  opacity:
                    placing ||
                    (form.delivery ===
                      "delivery" &&
                      !location)
                      ? 0.65
                      : 1,
                  cursor:
                    placing ||
                    (form.delivery ===
                      "delivery" &&
                      !location)
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {placing
                  ? "Processing…"
                  : form.payment ===
                    "upi_manual"
                  ? "Place order & show UPI payment"
                  : "Place order"}
              </button>

              <div
                style={
                  styles.footerUrl
                }
              >
                {WEBSITE_URL}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#faf7f0",
    color: "#16241b",
    fontFamily:
      "Inter,system-ui,sans-serif",
    padding:
      "24px 16px 60px",
    boxSizing: "border-box",
  },

  header: {
    maxWidth: 1200,
    margin:
      "0 auto 18px",
    display: "flex",
    justifyContent:
      "space-between",
    gap: 16,
    alignItems:
      "flex-start",
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
    margin:
      "4px 0 8px",
    letterSpacing:
      "-.03em",
  },

  muted: {
    color: "#657168",
    lineHeight: 1.6,
  },

  deliveryBanner: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "#edf5ef",
    border:
      "1px solid #d2e3d7",
    color: "#0e5938",
    fontSize: 14,
  },

  search: {
    maxWidth: 1200,
    margin:
      "0 auto 12px",
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
    background:
      "#fffdf9",
    boxSizing:
      "border-box",
    outline: "none",
  },

  cart: {
    whiteSpace: "nowrap",
    border: 0,
    borderRadius: 12,
    padding:
      "0 17px",
    background:
      "#0e5938",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },

  chips: {
    maxWidth: 1200,
    margin:
      "0 auto 20px",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  chip: {
    padding:
      "8px 12px",
    borderRadius: 999,
    border:
      "1px solid #d8ded8",
    background:
      "#fffdf9",
    color: "#57625b",
    cursor: "pointer",
  },

  active: {
    padding:
      "8px 12px",
    borderRadius: 999,
    border:
      "1px solid #0e5938",
    background:
      "#0e5938",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
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
    background:
      "#fffdf9",
    border:
      "1px solid #e7e0cf",
    borderRadius: 16,
    padding: 17,
    boxShadow:
      "0 3px 12px rgba(11,42,28,.05)",
  },

  icon: {
    fontSize: 28,
  },

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

  price: {
    fontWeight: 900,
    fontSize: 20,
    marginTop: 7,
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
    background:
      "#edf5ef",
    fontSize: 20,
    border: 0,
    cursor: "pointer",
  },

  alert: {
    maxWidth: 1200,
    margin:
      "0 auto 15px",
    padding: 12,
    borderRadius: 12,
    background:
      "#fff0ee",
    border:
      "1px solid #e9b6af",
    color: "#a33f34",
  },

  empty: {
    maxWidth: 1200,
    margin: "60px auto",
    textAlign: "center",
    color: "#6f7a70",
  },

  loading: {
    maxWidth: 1200,
    margin: "50px auto",
    textAlign: "center",
    color: "#6f7a70",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(0,0,0,.48)",
    display: "flex",
    justifyContent:
      "center",
    alignItems:
      "flex-end",
    zIndex: 1000,
  },

  modal: {
    width:
      "min(760px,100%)",
    maxHeight:
      "92dvh",
    overflowY:
      "auto",
    background:
      "#fffdf9",
    borderRadius:
      "22px 22px 0 0",
    padding: 22,
    boxSizing:
      "border-box",
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
    background:
      "transparent",
    cursor: "pointer",
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
    padding:
      "5px 0",
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
    padding:
      "3px 0",
  },

  two: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 10,
  },

  location: {
    padding: 13,
    borderRadius: 13,
    border:
      "1px solid #d8ded8",
    background:
      "#f2f6f3",
  },

  hint: {
    color: "#657168",
    lineHeight: 1.5,
    fontSize: 13,
    margin:
      "7px 0 10px",
  },

  gpsSuccess: {
    marginTop: 8,
    fontSize: 12,
    color: "#0e7b4a",
    fontWeight: 700,
  },

  payment: {
    display: "grid",
    gap: 8,
    padding: 13,
    borderRadius: 13,
    background:
      "#f2f6f3",
  },

  primary: {
    display:
      "inline-flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    width: "100%",
    padding:
      "13px 16px",
    borderRadius: 12,
    border: 0,
    background:
      "#0e5938",
    color: "white",
    fontWeight: 900,
    textDecoration:
      "none",
    boxSizing:
      "border-box",
    cursor: "pointer",
  },

  secondary: {
    display:
      "inline-flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    width: "100%",
    padding:
      "12px 16px",
    borderRadius: 12,
    border:
      "1px solid #d8ded8",
    background:
      "#fffdf9",
    fontWeight: 800,
    cursor: "pointer",
    boxSizing:
      "border-box",
  },

  secondarySmall: {
    display:
      "inline-flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    padding:
      "11px 14px",
    borderRadius: 12,
    border:
      "1px solid #d8ded8",
    background:
      "#fffdf9",
    fontWeight: 800,
    textDecoration:
      "none",
    color: "inherit",
  },

  notice: {
    padding: 13,
    borderRadius: 13,
    background:
      "#f2f6f3",
    marginBottom: 10,
  },

  success: {
    maxWidth: 560,
    margin:
      "8vh auto",
    background:
      "#fffdf9",
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
    borderRadius:
      "50%",
    display: "grid",
    placeItems:
      "center",
    background:
      "#e8f5ec",
    color: "#0e7b4a",
    fontWeight: 900,
    fontSize: 27,
    marginBottom: 15,
  },

  box: {
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    background:
      "#f6f8f5",
    margin:
      "18px 0",
  },

  footerUrl: {
    fontSize: 12,
    color: "#7a837c",
    textAlign: "center",
    wordBreak:
      "break-all",
  },
};