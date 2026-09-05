"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function AdminDashboard() {
  const [counts, setCounts] = useState({ newOrders: 0, preparing: 0, ready: 0 });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/pos/online-orders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load orders.");
      const orders = data.orders || [];
      setCounts({
        newOrders: orders.filter((o) => o.order_status === "pending_review").length,
        preparing: orders.filter((o) => o.order_status === "preparing").length,
        ready: orders.filter((o) => o.order_status === "ready").length,
      });
    } catch (e) {
      setError(e.message || "Unable to load dashboard.");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <main style={s.page}>
      <div style={s.shell}>
        <header style={s.header}>
          <div>
            <div style={s.kicker}>DHIMAN MEDICOS · STAFF ADMIN</div>
            <h1 style={s.title}>Admin Dashboard</h1>
            <p style={s.muted}>Retail billing, customer online orders, inventory and pharmacy controls.</p>
          </div>
          <button onClick={load} style={s.button}>↻ Refresh</button>
        </header>

        {error && <div style={s.error}>{error}</div>}

        <section style={s.stats}>
          <Link href="/admin/orders?status=pending_review" style={s.stat}>
            <span style={s.icon}>🛒</span>
            <strong style={s.num}>{counts.newOrders}</strong>
            <span>New online orders</span>
            <b style={s.link}>Open & accept →</b>
          </Link>
          <Link href="/admin/orders?status=preparing" style={s.stat}>
            <span style={s.icon}>📦</span>
            <strong style={s.num}>{counts.preparing}</strong>
            <span>Preparing</span>
            <b style={s.link}>Open queue →</b>
          </Link>
          <Link href="/admin/orders?status=ready" style={s.stat}>
            <span style={s.icon}>✅</span>
            <strong style={s.num}>{counts.ready}</strong>
            <span>Ready orders</span>
            <b style={s.link}>Open queue →</b>
          </Link>
        </section>

        <section style={s.card}>
          <div style={s.kicker}>ONLINE STORE</div>
          <h2>Customer orders</h2>
          <p style={s.muted}>Accept incoming orders, review prescriptions and move each order through fulfilment.</p>
          <div style={s.grid}>
            <Link href="/admin/orders?status=pending_review" style={s.primary}>
              🛒 Accept online orders
              <small>Review → Accept → Prepare</small>
            </Link>
            <Link href="/admin/orders" style={s.secondary}>
              📋 All online orders
              <small>Order history and status</small>
            </Link>
          </div>
        </section>

        <section style={s.card}>
          <div style={s.kicker}>RETAIL STORE</div>
          <h2>Counter operations</h2>
          <div style={s.grid}>
            <Link href="/pos" style={s.primary}>
              🧾 Retail Billing / POS
              <small>Walk-in customer billing</small>
            </Link>
            <Link href="/inventory" style={s.secondary}>
              📦 Inventory
              <small>Stock, batches and expiry</small>
            </Link>
            <Link href="/sales" style={s.secondary}>
              💰 Sales / Bills
              <small>Retail billing history</small>
            </Link>
          </div>
        </section>

        <section style={s.card}>
          <div style={s.kicker}>PHARMACY CONTROLS</div>
          <h2>Prescription classification</h2>
          <p style={s.muted}>Manage verified Schedule H, Schedule H1 and NRx classifications.</p>
          <Link href="/admin/prescription-classification" style={s.secondary}>
            💊 Manage H / H1 / NRx
          </Link>
        </section>
      </div>
    </main>
  );
}

const s = {
  page:{minHeight:"100vh",padding:"20px 16px 50px",background:"#f3f7f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},
  shell:{maxWidth:1100,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",alignItems:"flex-start",background:"#fff",border:"1px solid #dfe8e2",borderRadius:22,padding:22,marginBottom:16},
  kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},
  title:{margin:"5px 0",fontSize:"clamp(2rem,6vw,3rem)"},
  muted:{color:"#6d7b73",lineHeight:1.5},
  button:{padding:"10px 13px",border:"1px solid #d8e2dd",borderRadius:10,background:"#fff",fontWeight:800},
  error:{padding:12,borderRadius:12,background:"#fff0ee",color:"#9b3c32",marginBottom:14},
  stats:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginBottom:16},
  stat:{display:"grid",gap:4,padding:18,background:"#fff",border:"1px solid #dfe8e2",borderRadius:18,textDecoration:"none",color:"inherit"},
  icon:{fontSize:27},num:{fontSize:30},link:{color:"#087f5b",fontSize:13,marginTop:4},
  card:{background:"#fff",border:"1px solid #dfe8e2",borderRadius:20,padding:20,marginBottom:16},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginTop:14},
  primary:{display:"grid",gap:4,padding:15,borderRadius:13,background:"#087f5b",color:"white",textDecoration:"none",fontWeight:900},
  secondary:{display:"grid",gap:4,padding:15,borderRadius:13,border:"1px solid #d6e1db",background:"#fff",color:"inherit",textDecoration:"none",fontWeight:900},
};
