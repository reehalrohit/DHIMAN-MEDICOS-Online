"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import DeliveryLocationPicker from "../../components/DeliveryLocationPicker";

const empty = {
  full_name: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  landmark: "",
  city: "Binewal",
  state: "Punjab",
  pincode: "144523",
  latitude: null,
  longitude: null,
};

const labels = {
  pending_review: "Waiting for pharmacy review",
  confirmed: "Order confirmed",
  preparing: "Being prepared",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(empty);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const sb = getSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await sb.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          router.replace("/login?next=/account");
          return;
        }

        const [profileRes, ordersRes] = await Promise.all([
          fetch("/api/account/profile", { cache: "no-store" }),
          fetch("/api/account/orders", { cache: "no-store" }),
        ]);

        const profileData = await profileRes.json();
        const ordersData = await ordersRes.json();

        if (!profileRes.ok || !profileData.success) {
          throw new Error(profileData.error || "Unable to load profile.");
        }
        if (!ordersRes.ok || !ordersData.success) {
          throw new Error(ordersData.error || "Unable to load orders.");
        }

        if (active) {
          setUser(user);
          setProfile({ ...empty, ...(profileData.profile || {}) });
          setOrders(ordersData.orders || []);
        }
      } catch (e) {
        if (active) setError(e.message || "Unable to load account.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const field = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  function useCurrentGps() {
    if (!navigator.geolocation) {
      setError("Your browser does not support GPS location.");
      return;
    }

    setError("");
    setMessage("");
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setProfile((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setLocating(false);
        setMessage("Current GPS location captured. Drag the pin if you need to fine-tune it, then save your profile.");
      },
      (gpsError) => {
        setLocating(false);
        setError(
          gpsError.code === 1
            ? "Please allow location access to update your saved delivery pin."
            : "Unable to get your current location. Please try again."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to save profile.");
      }

      setProfile({ ...empty, ...data.profile });
      setMessage("Profile saved successfully.");
    } catch (e) {
      setError(e.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const newPassword = e.currentTarget.password.value;
    const confirmPassword = e.currentTarget.confirm.value;

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const { error: passwordError } =
        await getSupabaseBrowserClient().auth.updateUser({
          password: newPassword,
        });

      if (passwordError) throw passwordError;

      e.currentTarget.reset();
      setPasswordOpen(false);
      setMessage("Password changed successfully.");
    } catch (e) {
      setError(e.message || "Unable to change password.");
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/online-order");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={s.page}>
        <section style={s.loadingCard}>Loading account…</section>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <style jsx>{`
        .accountGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
          gap: 18px;
        }
        .profileTwo {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .profileThree {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 760px) {
          .accountGrid,
          .profileTwo,
          .profileThree {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={s.shell}>
        <header style={s.header}>
          <div>
            <div style={s.kicker}>DHIMAN MEDICOS</div>
            <h1 style={s.title}>My Account</h1>
            <p style={s.muted}>{user?.email}</p>
          </div>
          <div style={s.actions}>
            <Link href="/online-order" style={s.button}>
              Order medicines
            </Link>
            <button onClick={signOut} style={s.button}>
              Sign out
            </button>
          </div>
        </header>

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        <div className="accountGrid">
          <section style={s.section}>
            <div style={s.kicker}>PROFILE</div>
            <h2 style={s.h2}>Personal details</h2>

            <form onSubmit={save} style={s.form}>
              <div className="profileTwo">
                <label style={s.label}>
                  Full name
                  <input
                    style={s.input}
                    value={profile.full_name}
                    onChange={(e) => field("full_name", e.target.value)}
                    required
                    autoComplete="name"
                  />
                </label>

                <label style={s.label}>
                  Mobile number
                  <input
                    style={s.input}
                    value={profile.phone}
                    onChange={(e) => field("phone", e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    required
                  />
                </label>
              </div>

              <label style={s.label}>
                Email
                <input
                  style={{ ...s.input, background: "#f2f5f2" }}
                  value={user?.email || ""}
                  disabled
                />
              </label>

              <hr style={s.hr} />

              <div>
                <div style={s.kicker}>SAVED DELIVERY ADDRESS</div>
                <div style={s.hint}>
                  Saved details are used to prefill checkout. Home delivery
                  still requires a fresh GPS check.
                </div>
              </div>

              <label style={s.label}>
                Address
                <input
                  style={s.input}
                  value={profile.address_line1}
                  onChange={(e) => field("address_line1", e.target.value)}
                  placeholder="House / street / village"
                  autoComplete="street-address"
                />
              </label>

              <label style={s.label}>
                Address line 2
                <input
                  style={s.input}
                  value={profile.address_line2 || ""}
                  onChange={(e) => field("address_line2", e.target.value)}
                  placeholder="Area / apartment (optional)"
                />
              </label>

              <label style={s.label}>
                Landmark
                <input
                  style={s.input}
                  value={profile.landmark || ""}
                  onChange={(e) => field("landmark", e.target.value)}
                  placeholder="Nearby landmark (optional)"
                />
              </label>

              <div className="profileThree">
                <label style={s.label}>
                  City
                  <input
                    style={s.input}
                    value={profile.city}
                    onChange={(e) => field("city", e.target.value)}
                  />
                </label>
                <label style={s.label}>
                  State
                  <input
                    style={s.input}
                    value={profile.state}
                    onChange={(e) => field("state", e.target.value)}
                  />
                </label>
                <label style={s.label}>
                  PIN
                  <input
                    style={s.input}
                    value={profile.pincode}
                    onChange={(e) => field("pincode", e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>
              </div>

              <div style={s.location}>
                <div style={s.locationHead}>
                  <div>
                    <strong>📍 Saved delivery pin</strong>
                    <div style={s.hint}>
                      Optional saved navigation point. It is not a substitute
                      for the current GPS check during delivery checkout.
                    </div>
                  </div>
                </div>

                <div style={s.mapWrap}>
                  <DeliveryLocationPicker
                    value={
                      profile.latitude != null && profile.longitude != null
                        ? {
                            latitude: profile.latitude,
                            longitude: profile.longitude,
                          }
                        : null
                    }
                    onChange={(location) => {
                      field("latitude", location.latitude);
                      field("longitude", location.longitude);
                    }}
                    disabled={saving}
                  />
                </div>

                <button
                  type="button"
                  onClick={useCurrentGps}
                  disabled={locating || saving}
                  style={s.secondary}
                >
                  {locating ? "Getting GPS location…" : "Use my current GPS"}
                </button>
              </div>

              <button type="submit" disabled={saving} style={s.primary}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </form>
          </section>

          <aside style={s.side}>
            <section style={s.section}>
              <div style={s.kicker}>SECURITY</div>
              <h2 style={s.h2}>Password</h2>

              {!passwordOpen ? (
                <button
                  style={s.secondary}
                  onClick={() => setPasswordOpen(true)}
                >
                  Change password
                </button>
              ) : (
                <form onSubmit={changePassword} style={s.form}>
                  <input
                    name="password"
                    type="password"
                    minLength={6}
                    placeholder="New password"
                    autoComplete="new-password"
                    style={s.input}
                    required
                  />
                  <input
                    name="confirm"
                    type="password"
                    minLength={6}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    style={s.input}
                    required
                  />
                  <button style={s.primary}>Update password</button>
                </form>
              )}
            </section>

            <section style={s.section}>
              <div style={s.kicker}>LEGAL</div>
              <h2 style={s.h2}>Policies</h2>
              <div style={s.links}>
                <Link href="/privacy" style={s.button}>
                  Privacy Policy
                </Link>
                <Link href="/terms" style={s.button}>
                  Terms & Conditions
                </Link>
              </div>
            </section>
          </aside>
        </div>

        <section style={{ ...s.section, marginTop: 18 }}>
          <div style={s.kicker}>ORDERS</div>
          <h2 style={s.h2}>My orders</h2>

          {!orders.length ? (
            <div style={s.empty}>No online orders yet.</div>
          ) : (
            <div style={s.list}>
              {orders.map((order) => (
                <article key={order.id} style={s.order}>
                  <div style={s.row}>
                    <strong>{order.order_number}</strong>
                    <span style={s.badge}>
                      {labels[order.order_status] || order.order_status}
                    </span>
                  </div>

                  <div style={s.meta}>
                    Placed{" "}
                    {new Date(order.created_at).toLocaleString("en-IN")}
                  </div>

                  <div style={s.row}>
                    <span>
                      {order.delivery_method === "pickup"
                        ? "Store pickup"
                        : "Home delivery"}
                    </span>
                    <strong>₹{Number(order.total).toFixed(2)}</strong>
                  </div>

                  <div style={s.meta}>
                    {order.payment_method === "razorpay"
                      ? `Razorpay · ${order.payment_status}`
                      : "Pay on pickup"}
                    {order.prescription_status !== "not_required"
                      ? ` · Prescription ${order.prescription_status}`
                      : ""}
                  </div>

                  <Link
                    href={`/order/${order.tracking_token}`}
                    style={s.track}
                  >
                    Track order →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    padding: "20px 16px 50px",
    background: "#f3f8f5",
    fontFamily: "system-ui,sans-serif",
    color: "#17211d",
  },
  shell: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  loadingCard: {
    maxWidth: 430,
    margin: "20vh auto",
    background: "white",
    padding: 30,
    borderRadius: 20,
    textAlign: "center",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 15,
    flexWrap: "wrap",
    marginBottom: 18,
    padding: 20,
    background: "white",
    border: "1px solid #dfe8e2",
    borderRadius: 22,
  },
  title: {
    fontSize: "clamp(1.8rem, 6vw, 2.5rem)",
    margin: "5px 0",
  },
  grid: {},
  side: {
    display: "grid",
    gap: 18,
    alignContent: "start",
  },
  section: {
    background: "white",
    border: "1px solid #dfe8e2",
    borderRadius: 20,
    padding: "clamp(16px, 3vw, 22px)",
    minWidth: 0,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 900,
    color: "#087f5b",
  },
  h2: {
    fontSize: 20,
    margin: "5px 0 16px",
  },
  muted: {
    color: "#6d7b73",
  },
  hint: {
    fontSize: 12,
    color: "#748078",
    lineHeight: 1.45,
    marginTop: 5,
  },
  form: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: 12,
    border: "1px solid #d7e1dc",
    borderRadius: 11,
    fontSize: 15,
    background: "#fff",
  },
  location: {
    padding: 13,
    borderRadius: 14,
    border: "1px solid #dfe8e2",
    background: "#f7faf8",
    display: "grid",
    gap: 10,
  },
  locationHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  mapWrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 14,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  links: {
    display: "grid",
    gap: 8,
  },
  button: {
    padding: "10px 13px",
    border: "1px solid #d6e0da",
    borderRadius: 10,
    background: "white",
    color: "inherit",
    textDecoration: "none",
    fontWeight: 800,
    textAlign: "center",
  },
  primary: {
    padding: 13,
    border: 0,
    borderRadius: 12,
    background: "#087f5b",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    width: "100%",
  },
  secondary: {
    padding: 11,
    border: "1px solid #d6e0da",
    borderRadius: 10,
    background: "white",
    fontWeight: 800,
    width: "100%",
  },
  hr: {
    border: 0,
    borderTop: "1px solid #e5ece8",
    margin: "4px 0",
  },
  badge: {
    padding: "5px 9px",
    borderRadius: 999,
    background: "#eff7f1",
    color: "#126547",
    fontSize: 12,
    fontWeight: 800,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  order: {
    border: "1px solid #e1eae5",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
  },
  meta: {
    fontSize: 12,
    color: "#748078",
    margin: "6px 0 12px",
  },
  track: {
    color: "#087f5b",
    fontWeight: 900,
    textDecoration: "none",
  },
  empty: {
    padding: 30,
    textAlign: "center",
    color: "#77847c",
  },
  error: {
    padding: 12,
    borderRadius: 11,
    background: "#fff0ee",
    color: "#9b3c32",
    marginBottom: 15,
  },
  success: {
    padding: 12,
    borderRadius: 11,
    background: "#edf8f1",
    color: "#205d45",
    marginBottom: 15,
  },
};
