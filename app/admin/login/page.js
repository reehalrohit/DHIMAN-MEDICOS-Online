"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        if (data.user) {
          router.replace(searchParams.get("next") || "/admin");
          return;
        }
      } catch (_) {
        // Login form will surface configuration/auth errors on submit.
      } finally {
        if (active) setChecking(false);
      }
    }

    checkSession();
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Enter your admin email and password.");
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) throw signInError;

      const next = searchParams.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/admin";

      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setError(err?.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main style={styles.page}><div style={styles.card}><div style={styles.spinner}>Checking session…</div></div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.glow} />
      <section style={styles.card} aria-label="Admin login">
        <div style={styles.logo}>DM</div>
        <div style={styles.kicker}>DHIMAN MEDICOS</div>
        <h1 style={styles.title}>Admin Sign In</h1>
        <p style={styles.subtitle}>Secure access to POS, inventory and sales.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Admin email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              placeholder="admin@example.com"
              disabled={loading}
            />
          </label>

          <label style={styles.label}>
            Password
            <div style={styles.passwordWrap}>
              <input
                style={{ ...styles.input, paddingRight: 76 }}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                disabled={loading}
              />
              <button
                type="button"
                style={styles.showButton}
                onClick={() => setShowPassword((value) => !value)}
                disabled={loading}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.submit} disabled={loading}>
            {loading ? "Signing in…" : "Sign in securely"}
          </button>
        </form>

        <div style={styles.note}>
          <span>🔒</span>
          <span>Admin access is restricted to approved email addresses.</span>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "radial-gradient(circle at top, #e9fff6 0%, #f4f7f5 42%, #e9efec 100%)",
    position: "relative",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "rgba(6,95,70,.10)",
    filter: "blur(70px)",
    top: -160,
    right: -120,
  },
  card: {
    width: "min(100%, 430px)",
    padding: "34px 28px 26px",
    borderRadius: 26,
    background: "rgba(255,255,255,.94)",
    border: "1px solid rgba(6,95,70,.10)",
    boxShadow: "0 25px 70px rgba(24,54,43,.16)",
    position: "relative",
    zIndex: 1,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#075f46,#0a8b66)",
    color: "white",
    fontWeight: 900,
    letterSpacing: 1,
    boxShadow: "0 10px 24px rgba(6,95,70,.25)",
  },
  kicker: { marginTop: 20, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "#087f5b" },
  title: { margin: "6px 0 5px", fontSize: 30, lineHeight: 1.15, color: "#15221d" },
  subtitle: { margin: 0, color: "#69766f", fontSize: 14 },
  form: { marginTop: 26, display: "grid", gap: 17 },
  label: { display: "grid", gap: 8, fontSize: 13, fontWeight: 800, color: "#27352f" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d6e0db",
    borderRadius: 13,
    padding: "13px 14px",
    fontSize: 16,
    outline: "none",
    background: "#fbfdfc",
  },
  passwordWrap: { position: "relative" },
  showButton: {
    position: "absolute",
    right: 8,
    top: 8,
    bottom: 8,
    border: 0,
    borderRadius: 9,
    padding: "0 10px",
    background: "#edf5f1",
    color: "#075f46",
    fontWeight: 800,
    cursor: "pointer",
  },
  submit: {
    border: 0,
    borderRadius: 13,
    padding: "14px 16px",
    background: "linear-gradient(135deg,#075f46,#0a8b66)",
    color: "white",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 25px rgba(6,95,70,.22)",
  },
  error: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b42318",
    padding: "11px 12px",
    borderRadius: 11,
    fontSize: 13,
    lineHeight: 1.4,
  },
  note: {
    marginTop: 22,
    paddingTop: 17,
    borderTop: "1px solid #e7eeea",
    display: "flex",
    gap: 8,
    color: "#718079",
    fontSize: 11,
    lineHeight: 1.4,
  },
  spinner: { textAlign: "center", color: "#52615a", padding: 30 },
};
