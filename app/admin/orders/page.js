"use client";

import { useCallback, useEffect, useState } from "react";

const labels = {
  pending_review: "Needs review",
  confirmed: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [reviewed, setReviewed] = useState({});
  const [rxUrl, setRxUrl] = useState("");
  const [rxLoading, setRxLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const r = await fetch(
        `/api/pos/online-orders${filter ? `?status=${encodeURIComponent(filter)}` : ""}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "Unable to load orders.");
      setOrders(d.orders || []);
    } catch (e) {
      setError(e.message || "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function openReview(order) {
    setReviewing(order);
    setRxUrl("");
    setError("");

    if (order.prescription_id) {
      setRxLoading(true);
      try {
        const r = await fetch(
          `/api/prescriptions?id=${encodeURIComponent(order.prescription_id)}`,
          { cache: "no-store" }
        );
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || "Unable to open prescription.");
        setRxUrl(d.prescription?.url || "");
      } catch (e) {
        setError(e.message || "Unable to open prescription.");
      } finally {
        setRxLoading(false);
      }
    }
  }

  function closeReview() {
    setReviewing(null);
    setRxUrl("");
  }

  async function update(id, payload) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/pos/online-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "Update failed.");
      await load();
      closeReview();
    } catch (e) {
      setError(e.message || "Update failed.");
    } finally {
      setBusy("");
    }
  }

  async function approvePrescriptionFromReview() {
    if (!reviewing?.prescription_id) return;
    await update(reviewing.id, { prescription_status: "approved" });
  }

  async function rejectPrescriptionFromReview() {
    if (!reviewing?.prescription_id) return;
    await update(reviewing.id, { prescription_status: "rejected" });
  }

  function markReviewed(orderId) {
    setReviewed((old) => ({ ...old, [orderId]: true }));
  }

  return (
    <main style={s.page}>
      <section style={s.shell}>
        <header style={s.header}>
          <div>
            <div style={s.kicker}>DHIMAN MEDICOS · STAFF</div>
            <h1 style={{ margin: "4px 0" }}>Online Store Orders</h1>
            <p style={s.muted}>
              Review the complete order and prescription first. Acceptance is only available after review.
            </p>
          </div>
          <button onClick={load} style={s.refresh}>↻ Refresh</button>
        </header>

        <div style={s.filters}>
          <button onClick={() => setFilter("")} style={!filter ? s.active : s.chip}>All</button>
          {Object.keys(labels).map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={filter === k ? s.active : s.chip}>
              {labels[k]}
            </button>
          ))}
        </div>

        {error && <div style={s.alert}>{error}</div>}

        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : !orders.length ? (
          <div style={s.empty}>No online orders in this view.</div>
        ) : (
          <div style={s.list}>
            {orders.map((o) => {
              const needsRx = o.prescription_status === "pending";
              const hasBeenReviewed = Boolean(reviewed[o.id]);
              const canAccept =
                o.order_status === "pending_review" &&
                hasBeenReviewed &&
                (!needsRx) &&
                (o.payment_method !== "razorpay" || o.payment_status === "paid");

              return (
                <article key={o.id} style={s.card}>
                  <div style={s.top}>
                    <div>
                      <strong>{o.order_number}</strong>
                      <small style={s.small}>
                        {new Date(o.created_at).toLocaleString("en-IN")}
                      </small>
                    </div>
                    <span style={s.badge}>{labels[o.order_status] || o.order_status}</span>
                  </div>

                  <div style={s.customer}>
                    <strong>{o.customer_name}</strong>
                    <span>📞 {o.customer_phone}</span>
                    <span>
                      {o.delivery_method === "pickup"
                        ? "🏪 Store pickup"
                        : `🏠 ${o.address_line1}, ${o.city} ${o.pincode}`}
                    </span>
                    {o.delivery_method === "delivery" &&
                      Number.isFinite(Number(o.delivery_distance_km)) && (
                        <span>📍 {Number(o.delivery_distance_km).toFixed(2)} km from store</span>
                      )}
                  </div>

                  <div style={s.summary}>
                    <div><span>Items</span><strong>{(o.items || []).length} line(s)</strong></div>
                    <div><span>Total</span><strong>₹{Number(o.total).toFixed(2)}</strong></div>
                    <div><span>Payment</span><strong>{o.payment_method === "razorpay" ? `Razorpay · ${o.payment_status}` : "Pay on pickup"}</strong></div>
                    {o.prescription_status !== "not_required" && (
                      <div><span>Prescription</span><strong>{o.prescription_status}</strong></div>
                    )}
                  </div>

                  <div style={s.actions}>
                    <button
                      onClick={() => openReview(o)}
                      disabled={busy === o.id}
                      style={s.reviewButton}
                    >
                      🔎 Review order & prescription
                    </button>

                    {o.order_status === "pending_review" && !hasBeenReviewed && (
                      <span style={s.wait}>Review required before acceptance.</span>
                    )}

                    {o.order_status === "pending_review" && hasBeenReviewed && needsRx && (
                      <span style={s.wait}>Prescription still needs approval.</span>
                    )}

                    {canAccept && (
                      <button
                        disabled={busy === o.id}
                        onClick={() => update(o.id, { status: "confirmed" })}
                        style={s.primary}
                      >
                        ✓ Accept order
                      </button>
                    )}

                    {o.order_status === "confirmed" && (
                      <button disabled={busy === o.id} onClick={() => update(o.id, { status: "preparing" })} style={s.primary}>
                        Start preparing
                      </button>
                    )}
                    {o.order_status === "preparing" && (
                      <button disabled={busy === o.id} onClick={() => update(o.id, { status: "ready" })} style={s.primary}>
                        Mark ready
                      </button>
                    )}
                    {o.order_status === "ready" && (
                      <button disabled={busy === o.id} onClick={() => update(o.id, { status: "out_for_delivery" })} style={s.primary}>
                        Out for delivery
                      </button>
                    )}
                    {o.order_status === "out_for_delivery" && (
                      <button disabled={busy === o.id} onClick={() => update(o.id, { status: "delivered" })} style={s.primary}>
                        Mark delivered
                      </button>
                    )}
                    {["pending_review", "confirmed", "preparing"].includes(o.order_status) &&
                      o.payment_status !== "paid" && (
                        <button disabled={busy === o.id} onClick={() => update(o.id, { status: "cancelled" })} style={s.cancel}>
                          Cancel
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {reviewing && (
        <div style={s.overlay}>
          <section style={s.modal}>
            <header style={s.modalHeader}>
              <div>
                <div style={s.kicker}>ORDER REVIEW</div>
                <h2 style={{ margin: "4px 0" }}>{reviewing.order_number}</h2>
                <div style={s.muted}>
                  {reviewing.customer_name} · {reviewing.customer_phone}
                </div>
              </div>
              <button onClick={closeReview} style={s.close}>✕</button>
            </header>

            <section style={s.reviewSection}>
              <h3>Order items</h3>
              <div style={s.items}>
                {(reviewing.items || []).map((i, n) => (
                  <div key={`${i.medicine_id || i.medicine_name}-${n}`} style={s.itemRow}>
                    <div>
                      <strong>{i.medicine_name}</strong>
                      <small style={s.small}>
                        Qty {i.quantity} · ₹{Number(i.unit_price).toFixed(2)} each
                      </small>
                    </div>
                    <strong>₹{Number(i.line_total).toFixed(2)}</strong>
                  </div>
                ))}
              </div>

              <div style={s.reviewFacts}>
                <span><b>Fulfilment:</b> {reviewing.delivery_method === "pickup" ? "Store pickup" : "Home delivery"}</span>
                {reviewing.delivery_method === "delivery" && (
                  <span><b>GPS distance:</b> {Number.isFinite(Number(reviewing.delivery_distance_km)) ? `${Number(reviewing.delivery_distance_km).toFixed(2)} km` : "Not recorded"}</span>
                )}
                <span><b>Total:</b> ₹{Number(reviewing.total).toFixed(2)}</span>
                <span><b>Payment:</b> {reviewing.payment_method === "razorpay" ? `Razorpay · ${reviewing.payment_status}` : "Pay on pickup"}</span>
              </div>
            </section>

            <section style={s.reviewSection}>
              <h3>Prescription</h3>
              {reviewing.prescription_status === "not_required" ? (
                <div style={s.noRx}>No prescription required for this order.</div>
              ) : !reviewing.prescription_id ? (
                <div style={s.alert}>Prescription required, but no prescription is attached.</div>
              ) : rxLoading ? (
                <div style={s.noRx}>Opening prescription…</div>
              ) : rxUrl ? (
                <div>
                  <div style={s.rxStatus}>
                    <span>Status: <b>{reviewing.prescription_status}</b></span>
                    {reviewing.prescription_status === "pending" && (
                      <span>Review the document before approving.</span>
                    )}
                  </div>
                  <iframe
                    src={rxUrl}
                    title="Customer prescription"
                    style={s.pdf}
                  />
                  <a href={rxUrl} target="_blank" rel="noreferrer" style={s.openRx}>
                    Open prescription in new tab ↗
                  </a>
                </div>
              ) : (
                <div style={s.alert}>Unable to load the prescription document.</div>
              )}
            </section>

            {reviewing.order_status === "pending_review" && (
              <section style={s.confirmReview}>
                <label style={s.checkRow}>
                  <input
                    type="checkbox"
                    checked={Boolean(reviewed[reviewing.id])}
                    onChange={(e) => markReviewed(reviewing.id)}
                  />
                  I have reviewed the order items and prescription.
                </label>

                <div style={s.actions}>
                  {reviewing.prescription_status === "pending" && reviewing.prescription_id && (
                    <>
                      <button
                        disabled={busy === reviewing.id || !rxUrl}
                        onClick={approvePrescriptionFromReview}
                        style={s.green}
                      >
                        Approve prescription
                      </button>
                      <button
                        disabled={busy === reviewing.id || !rxUrl}
                        onClick={rejectPrescriptionFromReview}
                        style={s.red}
                      >
                        Reject prescription
                      </button>
                    </>
                  )}

                  {reviewed[reviewing.id] && reviewing.prescription_status !== "pending" && (
                    <button
                      disabled={busy === reviewing.id || (reviewing.payment_method === "razorpay" && reviewing.payment_status !== "paid")}
                      onClick={() => update(reviewing.id, { status: "confirmed" })}
                      style={s.primary}
                    >
                      ✓ Accept reviewed order
                    </button>
                  )}

                  {reviewing.payment_method === "razorpay" && reviewing.payment_status !== "paid" && (
                    <span style={s.wait}>Online payment must be confirmed before acceptance.</span>
                  )}
                </div>
              </section>
            )}

            <button onClick={closeReview} style={s.secondary}>Close review</button>
          </section>
        </div>
      )}
    </main>
  );
}

const s = {
  page:{minHeight:"100vh",padding:20,background:"#f3f7f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},
  shell:{maxWidth:1100,margin:"0 auto",background:"#fff",border:"1px solid #dfe8e2",borderRadius:24,padding:24,boxShadow:"0 16px 50px rgba(30,55,45,.08)"},
  header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:18,flexWrap:"wrap"},
  kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},muted:{color:"#718079",lineHeight:1.5},
  refresh:{border:"1px solid #d8e2dd",padding:"10px 13px",borderRadius:10,background:"white",fontWeight:800},
  filters:{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18},chip:{padding:"7px 10px",border:"1px solid #d8e2dd",borderRadius:999,background:"white",color:"#607068"},
  active:{padding:"7px 10px",border:"1px solid #087f5b",borderRadius:999,background:"#087f5b",color:"white",fontWeight:800},
  alert:{padding:12,borderRadius:12,background:"#fff0ee",border:"1px solid #e9b6af",color:"#9b3c32",marginBottom:14},
  empty:{padding:50,textAlign:"center",color:"#77847c"},list:{display:"grid",gap:14},
  card:{border:"1px solid #e1eae5",borderRadius:18,padding:17,background:"linear-gradient(180deg,#fff,#f8fbf9)"},
  top:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"},small:{display:"block",fontSize:11,color:"#7a837c",marginTop:3},
  badge:{padding:"5px 9px",borderRadius:999,background:"#eff7f1",color:"#126547",fontSize:12,fontWeight:800},
  customer:{display:"grid",gap:3,margin:"13px 0",color:"#435149"},
  summary:{display:"grid",gap:7,padding:12,borderRadius:13,background:"#f6f9f7",border:"1px solid #e2eae5"},
  summaryRow:{display:"flex",justifyContent:"space-between"},actions:{display:"flex",gap:8,flexWrap:"wrap",marginTop:12,alignItems:"center"},
  reviewButton:{padding:"10px 13px",border:"1px solid #b9d9cb",borderRadius:10,background:"#edf8f2",color:"#146344",fontWeight:900},
  primary:{padding:"10px 13px",border:0,borderRadius:10,background:"#087f5b",color:"white",fontWeight:900},
  green:{padding:"10px 13px",border:0,borderRadius:10,background:"#e8f6ed",color:"#116842",fontWeight:900},
  red:{padding:"10px 13px",border:"1px solid #e9b6af",borderRadius:10,background:"white",color:"#a23c33",fontWeight:900},
  cancel:{padding:"10px 13px",border:"1px solid #d7cfca",borderRadius:10,background:"white",color:"#74564b",fontWeight:800},
  wait:{fontSize:12,color:"#7b5a27",fontWeight:700},
  overlay:{position:"fixed",inset:0,zIndex:1000,background:"rgba(9,26,19,.62)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 12px",overflowY:"auto"},
  modal:{width:"min(820px,100%)",background:"#fff",borderRadius:20,padding:20,boxShadow:"0 24px 80px rgba(0,0,0,.25)"},
  modalHeader:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",paddingBottom:12,borderBottom:"1px solid #e2eae5"},
  close:{border:0,background:"#f2f5f3",borderRadius:10,padding:"8px 10px",fontWeight:900},
  reviewSection:{marginTop:16,padding:15,border:"1px solid #e1eae5",borderRadius:15},
  items:{display:"grid",gap:8},itemRow:{display:"flex",justifyContent:"space-between",gap:14,padding:"9px 0",borderBottom:"1px solid #edf0ee"},
  reviewFacts:{display:"flex",gap:12,flexWrap:"wrap",marginTop:10,fontSize:13,color:"#596760"},
  noRx:{padding:12,borderRadius:10,background:"#f4f8f5",color:"#52625a"},
  rxStatus:{display:"flex",gap:10,flexWrap:"wrap",fontSize:13,color:"#56645d",marginBottom:8},
  pdf:{width:"100%",height:500,border:"1px solid #dbe5df",borderRadius:12,background:"#eef2ef"},
  openRx:{display:"inline-block",marginTop:8,color:"#087f5b",fontWeight:900,textDecoration:"none"},
  confirmReview:{marginTop:16,padding:15,borderRadius:15,background:"#f7faf8",border:"1px solid #dfe8e2"},
  checkRow:{display:"flex",gap:9,alignItems:"flex-start",fontWeight:800,fontSize:14,lineHeight:1.45},
  secondary:{width:"100%",marginTop:12,padding:"11px 13px",border:"1px solid #d6e1db",borderRadius:10,background:"white",fontWeight:800},
};
