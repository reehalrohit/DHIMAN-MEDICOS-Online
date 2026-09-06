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
        const { data: { user }, error: userError } = await sb.auth.getUser();

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

  const field = (key, value) =>
    setProfile((current) => ({ ...current, [key]: value }));

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
        setMessage("GPS location captured. Save your profile to keep it.");
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
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={s.page}>
        <section style={s.loadingCard}>Loading your account…</section>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.shell}>
        <header style={s.topbar}>
          <Link href="/online-order" style={s.back}>← Medicines</Link>
          <button onClick={signOut} style={s.signOut}>Sign out</button>
        </header>

        <section style={s.hero}>
          <div style={s.logo}>DM</div>
          <div>
            <div style={s.kicker}>DHIMAN MEDICOS</div>
            <h1 style={s.title}>My Account</h1>
            <p style={s.muted}>{user?.email}</p>
          </div>
        </section>

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        <section style={s.section}>
          <div style={s.kicker}>PROFILE</div>
          <h2 style={s.h2}>Personal details</h2>

          <form onSubmit={save} style={s.form}>
            <label style={s.label}>
              Full name
              <input
                style={s.input}
                value={profile.full_name}
                onChange={(e) => field("full_name", e.target.value)}
                autoComplete="name"
                required
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

            <label style={s.label}>
              Email
              <input
                style={{ ...s.input, background: "#f1f5f2" }}
                value={user?.email || ""}
                disabled
              />
            </label>

            <div style={s.divider} />

            <div>
              <div style={s.kicker}>DELIVERY ADDRESS</div>
              <div style={s.hint}>
                Saved details prefill checkout. Home delivery still requires a
                fresh GPS verification.
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

            <div style={s.three}>
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

            <section style={s.location}>
              <strong>📍 Saved delivery location</strong>
              <p style={s.hint}>
                Save your preferred GPS point. Checkout will still verify the
                customer's live location for the 2 km delivery rule.
              </p>

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

              <button
                type="button"
                onClick={useCurrentGps}
                disabled={locating || saving}
                style={s.secondary}
              >
                {locating ? "Getting GPS location…" : "Use my current GPS"}
              </button>
            </section>

            <button type="submit" disabled={saving} style={s.primary}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        <section style={s.section}>
          <div style={s.kicker}>MY ORDERS</div>
          <h2 style={s.h2}>Order history</h2>

          {!orders.length ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📦</div>
              <strong>No online orders yet</strong>
              <p style={s.hint}>Your orders will appear here.</p>
              <Link href="/online-order" style={s.primaryLink}>
                Start shopping
              </Link>
            </div>
          ) : (
            <div style={s.orders}>
              {orders.map((order) => (
                <article key={order.id} style={s.order}>
                  <div style={s.orderTop}>
                    <div>
                      <strong>{order.order_number}</strong>
                      <span style={s.small}>
                        {new Date(order.created_at).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <span style={s.badge}>
                      {labels[order.order_status] || order.order_status}
                    </span>
                  </div>

                  <div style={s.orderFacts}>
                    <span>
                      {order.delivery_method === "pickup"
                        ? "🏪 Store pickup"
                        : "🏠 Home delivery"}
                    </span>
                    <strong>₹{Number(order.total).toFixed(2)}</strong>
                  </div>

                  <div style={s.small}>
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

        <section style={s.section}>
          <div style={s.kicker}>SECURITY</div>
          <h2 style={s.h2}>Account security</h2>

          {!passwordOpen ? (
            <button
              type="button"
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

        <footer style={s.footer}>
          <Link href="/privacy" style={s.footerLink}>Privacy Policy</Link>
          <Link href="/terms" style={s.footerLink}>Terms & Conditions</Link>
        </footer>
      </div>
    </main>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#f4f8f5",
    padding: "18px 14px 70px",
    fontFamily: "Inter,system-ui,sans-serif",
    color: "#15221b",
  },
  shell: { maxWidth: 760, margin: "0 auto" },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  back: { color: "#075f46", fontWeight: 900, textDecoration: "none" },
  signOut: {
    border: "1px solid #d4e0d9",
    background: "#fff",
    borderRadius: 11,
    padding: "9px 12px",
    fontWeight: 800,
  },
  hero: {
    background: "#075f46",
    color: "#fff",
    borderRadius: 22,
    padding: 20,
    display: "flex",
    gap: 14,
    alignItems: "center",
    boxShadow: "0 14px 38px rgba(7,95,70,.16)",
  },
  logo: {
    width: 58, height: 58, borderRadius: 18, display: "grid",
    placeItems: "center", background: "#0a7657", fontWeight: 900, fontSize: 22,
  },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: 900, color: "#07805c" },
  title: { margin: "4px 0 3px", fontSize: 34, letterSpacing: "-.035em" },
  muted: { margin: 0, color: "#bfe0d2", lineHeight: 1.5 },
  section: {
    background: "#fff",
    border: "1px solid #dfe8e2",
    borderRadius: 18,
    padding: 17,
    marginTop: 14,
  },
  h2: { margin: "5px 0 14px", fontSize: 22 },
  form: { display: "grid", gap: 11 },
  label: { display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#526158" },
  input: {
    width: "100%", boxSizing: "border-box", padding: "12px 13px",
    border: "1px solid #d5e0d9", borderRadius: 11, background: "#fff", fontSize: 16,
  },
  three: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 },
  divider: { height: 1, background: "#e5ece8", margin: "5px 0" },
  hint: { margin: "4px 0 0", fontSize: 12, color: "#748078", lineHeight: 1.45 },
  location: {
    padding: 13, borderRadius: 13, background: "#f2f7f4",
    border: "1px solid #dbe7e0",
  },
  primary: {
    border: 0, borderRadius: 12, padding: "13px 14px",
    background: "#07805c", color: "#fff", fontWeight: 900, fontSize: 15,
  },
  primaryLink: {
    display: "inline-flex", marginTop: 8, padding: "11px 13px",
    borderRadius: 11, background: "#07805c", color: "#fff",
    textDecoration: "none", fontWeight: 900,
  },
  secondary: {
    width: "100%", marginTop: 9, border: "1px solid #cfded6",
    borderRadius: 11, padding: "11px 12px", background: "#fff",
    fontWeight: 800, color: "#075f46",
  },
  error: { marginTop: 12, padding: 11, borderRadius: 11, background: "#fff0ee", color: "#963d34" },
  success: { marginTop: 12, padding: 11, borderRadius: 11, background: "#eef8f2", color: "#185f45" },
  orders: { display: "grid", gap: 10 },
  order: { border: "1px solid #e1e9e4", borderRadius: 14, padding: 13 },
  orderTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  orderFacts: { display: "flex", justifyContent: "space-between", gap: 10, marginTop: 11 },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#eff7f2", color: "#126447", fontSize: 11, fontWeight: 900 },
  small: { display: "block", marginTop: 4, fontSize: 11, color: "#77847d" },
  track: { display: "inline-block", marginTop: 10, color: "#075f46", textDecoration: "none", fontWeight: 900, fontSize: 13 },
  empty: { textAlign: "center", padding: "25px 8px" },
  emptyIcon: { fontSize: 34, marginBottom: 7 },
  footer: { display: "flex", justifyContent: "center", gap: 20, padding: "24px 0 0" },
  footerLink: { color: "#617068", textDecoration: "none", fontSize: 13, fontWeight: 700 },
  loadingCard: { maxWidth: 420, margin: "20vh auto", background: "#fff", padding: 28, borderRadius: 18, textAlign: "center" },
};
