"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (active) setUser(data.user || null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  async function logout() {
    try {
      setSigningOut(true);
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) return <main style={styles.page}><div style={styles.card}>Loading admin dashboard…</div></main>;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>DHIMAN MEDICOS</div>
            <h1 style={styles.title}>Admin Dashboard</h1>
            <p style={styles.subtitle}>{user?.email || "Authenticated admin"}</p>
          </div>
          <button onClick={logout} disabled={signingOut} style={styles.logout}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>

        <div style={styles.grid}>
          <Link href="/pos" style={styles.tile}><span>🧾</span><strong>POS Billing</strong><small>Create sales and collect payments</small></Link>
          <Link href="/inventory" style={styles.tile}><span>📦</span><strong>Inventory</strong><small>Manage stock and movements</small></Link>
          <Link href="/sales" style={styles.tile}><span>📊</span><strong>Sales History</strong><small>Invoices, PDF and print</small></Link>
          <Link href="/admin/orders" style={styles.tile}><span>🛍️</span><strong>Online Orders</strong><small>Review customer orders and fulfilment</small></Link>
          <Link href="/" style={styles.tile}><span>🌐</span><strong>Storefront</strong><small>Open public website</small></Link>
        </div>

        <div style={styles.security}><span>🛡️</span><div><strong>Admin protection enabled</strong><small>POS, inventory, sales and online-order management require an authenticated approved admin account.</small></div></div>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 20, background: "#f3f7f5", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { width: "min(100%, 920px)", margin: "0 auto", padding: 28, background: "#fff", border: "1px solid #e2ebe6", borderRadius: 26, boxShadow: "0 20px 60px rgba(30,55,45,.10)" },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 26 },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: 900, color: "#087f5b" },
  title: { margin: "4px 0", fontSize: 30, color: "#17211d" },
  subtitle: { margin: 0, color: "#718079", fontSize: 13 },
  logout: { border: "1px solid #d8e2dd", background: "#fff", color: "#283630", borderRadius: 11, padding: "10px 14px", fontWeight: 800, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 },
  tile: { textDecoration: "none", color: "inherit", display: "grid", gap: 7, padding: 20, borderRadius: 18, border: "1px solid #e1eae5", background: "linear-gradient(180deg,#fff,#f7faf8)", minHeight: 130 },
  security: { marginTop: 20, display: "flex", gap: 12, alignItems: "flex-start", padding: 15, borderRadius: 15, background: "#eff9f4", color: "#145c47" },
  card: { maxWidth: 500, margin: "15vh auto", padding: 30, background: "#fff", borderRadius: 20, textAlign: "center" },
};
