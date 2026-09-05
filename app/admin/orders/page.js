"use client";
import { useCallback, useEffect, useState } from "react";

const labels={pending_review:"Needs review",confirmed:"Accepted",preparing:"Preparing",ready:"Ready",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected"};

export default function AdminOrdersPage(){
  const[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(""),[filter,setFilter]=useState("");
  const load=useCallback(async()=>{setLoading(true);try{setError("");const r=await fetch(`/api/pos/online-orders${filter?`?status=${encodeURIComponent(filter)}`:""}`,{cache:"no-store"});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to load orders.");setOrders(d.orders||[])}catch(e){setError(e.message||"Unable to load orders.")}finally{setLoading(false)}},[filter]);
  useEffect(()=>{load();const t=setInterval(load,10000);return()=>clearInterval(t)},[load]);

  async function update(id,payload){setBusy(id);setError("");try{const r=await fetch("/api/pos/online-orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...payload})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Update failed.");await load()}catch(e){setError(e.message||"Update failed.")}finally{setBusy("")}}

  return <main style={s.page}><section style={s.shell}>
    <header style={s.header}><div><div style={s.kicker}>DHIMAN MEDICOS · STAFF</div><h1>Online Store Orders</h1><p style={s.muted}>Receive, review, accept and fulfil customer orders.</p></div><button onClick={load} style={s.refresh}>↻ Refresh</button></header>
    <div style={s.filters}><button onClick={()=>setFilter("")} style={!filter?s.active:s.chip}>All</button>{Object.keys(labels).map(k=><button key={k} onClick={()=>setFilter(k)} style={filter===k?s.active:s.chip}>{labels[k]}</button>)}</div>
    {error&&<div style={s.alert}>{error}</div>}
    {loading?<div style={s.empty}>Loading…</div>:!orders.length?<div style={s.empty}>No online orders in this view.</div>:<div style={s.list}>{orders.map(o=>{
      const needsRx=o.prescription_status==="pending";
      const canAccept=o.order_status==="pending_review" && (!needsRx);
      return <article key={o.id} style={s.card}>
        <div style={s.top}><div><strong>{o.order_number}</strong><small style={s.small}>{new Date(o.created_at).toLocaleString("en-IN")}</small></div><span style={s.badge}>{labels[o.order_status]||o.order_status}</span></div>
        <div style={s.customer}><strong>{o.customer_name}</strong><span>📞 {o.customer_phone}</span><span>{o.delivery_method==="pickup"?"🏪 Store pickup":`🏠 ${o.address_line1}, ${o.city} ${o.pincode}`}</span>{o.delivery_method==="delivery"&&Number.isFinite(Number(o.delivery_distance_km))&&<span>📍 {Number(o.delivery_distance_km).toFixed(2)} km from store</span>}</div>
        <div style={s.items}>{(o.items||[]).map((i,n)=><div key={`${i.medicine_id||i.medicine_name}-${n}`} style={s.itemRow}><span>{i.medicine_name} × {i.quantity}</span><strong>₹{Number(i.line_total).toFixed(2)}</strong></div>)}</div>
        <div style={s.bottom}><strong>₹{Number(o.total).toFixed(2)}</strong><span>{o.payment_method==="razorpay"?`Razorpay · ${o.payment_status}`:"Pay on pickup"}</span>{o.prescription_status!=="not_required"&&<span>Rx: {o.prescription_status}</span>}</div>
        <div style={s.actions}>
          {needsRx&&<><button disabled={busy===o.id} onClick={()=>update(o.id,{prescription_status:"approved"})} style={s.green}>Approve prescription</button><button disabled={busy===o.id} onClick={()=>update(o.id,{prescription_status:"rejected"})} style={s.red}>Reject prescription</button></>}
          {canAccept&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"confirmed"})} style={s.primary}>✓ Accept order</button>}
          {o.order_status==="pending_review"&&needsRx&&<span style={s.wait}>Approve the prescription before accepting.</span>}
          {o.order_status==="confirmed"&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"preparing"})} style={s.primary}>Start preparing</button>}
          {o.order_status==="preparing"&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"ready"})} style={s.primary}>Mark ready</button>}
          {o.order_status==="ready"&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"out_for_delivery"})} style={s.primary}>Out for delivery</button>}
          {o.order_status==="out_for_delivery"&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"delivered"})} style={s.primary}>Mark delivered</button>}
          {["pending_review","confirmed","preparing"].includes(o.order_status)&&o.payment_status!=="paid"&&<button disabled={busy===o.id} onClick={()=>update(o.id,{status:"cancelled"})} style={s.cancel}>Cancel</button>}
        </div>
      </article>
    })}</div>}
  </section></main>
}
const s={page:{minHeight:"100vh",padding:20,background:"#f3f7f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},shell:{maxWidth:1100,margin:"0 auto",background:"#fff",border:"1px solid #dfe8e2",borderRadius:24,padding:24,boxShadow:"0 16px 50px rgba(30,55,45,.08)"},header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:18,flexWrap:"wrap"},kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},muted:{color:"#718079"},refresh:{border:"1px solid #d8e2dd",padding:"10px 13px",borderRadius:10,background:"white",fontWeight:800},filters:{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18},chip:{padding:"7px 10px",border:"1px solid #d8e2dd",borderRadius:999,background:"white",color:"#607068"},active:{padding:"7px 10px",border:"1px solid #087f5b",borderRadius:999,background:"#087f5b",color:"white",fontWeight:800},alert:{padding:12,borderRadius:12,background:"#fff0ee",border:"1px solid #e9b6af",color:"#9b3c32",marginBottom:14},empty:{padding:50,textAlign:"center",color:"#77847c"},list:{display:"grid",gap:14},card:{border:"1px solid #e1eae5",borderRadius:18,padding:17,background:"linear-gradient(180deg,#fff,#f8fbf9)"},top:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"},small:{display:"block",fontSize:11,color:"#7a837c",marginTop:3},badge:{padding:"5px 9px",borderRadius:999,background:"#eff7f1",color:"#126547",fontSize:12,fontWeight:800},customer:{display:"grid",gap:3,margin:"13px 0",color:"#435149"},items:{borderTop:"1px solid #e5eae6",borderBottom:"1px solid #e5eae6",padding:"9px 0",display:"grid",gap:6},itemRow:{display:"flex",justifyContent:"space-between",gap:10},bottom:{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",paddingTop:11,color:"#536058"},actions:{display:"flex",gap:8,flexWrap:"wrap",marginTop:12,alignItems:"center"},primary:{padding:"10px 13px",border:0,borderRadius:10,background:"#087f5b",color:"white",fontWeight:900},green:{padding:"10px 13px",border:0,borderRadius:10,background:"#e8f6ed",color:"#116842",fontWeight:900},red:{padding:"10px 13px",border:"1px solid #e9b6af",borderRadius:10,background:"white",color:"#a23c33",fontWeight:900},cancel:{padding:"10px 13px",border:"1px solid #d7cfca",borderRadius:10,background:"white",color:"#74564b",fontWeight:800},wait:{fontSize:12,color:"#7b5a27",fontWeight:700}}
