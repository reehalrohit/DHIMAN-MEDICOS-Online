/* See accompanying API route. */
"use client";

import { useCallback, useEffect, useState } from "react";

const labels={pending_review:"Needs review",confirmed:"Accepted",preparing:"Preparing",ready:"Ready",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected"};

export default function AdminOrdersPage(){
  const[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(""),[filter,setFilter]=useState("");
  const[reviewing,setReviewing]=useState(null),[reviewed,setReviewed]=useState({}),[rxUrl,setRxUrl]=useState(""),[rxLoading,setRxLoading]=useState(false),[rejectReason,setRejectReason]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setError("");
      const r=await fetch(`/api/pos/online-orders${filter?`?status=${encodeURIComponent(filter)}`:""}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||"Unable to load orders.");
      setOrders(d.orders||[]);
    }catch(e){setError(e.message||"Unable to load orders.")}finally{setLoading(false)}
  },[filter]);

  useEffect(()=>{load();const t=setInterval(load,10000);return()=>clearInterval(t)},[load]);

  async function openReview(o){
    setReviewing(o);setRejectReason("");setRxUrl("");setError("");
    if(o.prescription_id){
      setRxLoading(true);
      try{
        const r=await fetch(`/api/prescriptions?id=${encodeURIComponent(o.prescription_id)}`,{cache:"no-store"});
        const d=await r.json();
        if(!r.ok||!d.success)throw new Error(d.error||"Unable to open prescription.");
        setRxUrl(d.prescription?.url||"");
      }catch(e){setError(e.message||"Unable to open prescription.")}finally{setRxLoading(false)}
    }
  }
  function closeReview(){setReviewing(null);setRxUrl("");setRejectReason("")}

  async function update(id,payload,keep=false){
    setBusy(id);setError("");
    try{
      const r=await fetch("/api/pos/online-orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...payload})});
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||"Update failed.");
      await load();
      if(keep&&d.order)setReviewing(d.order);else closeReview();
    }catch(e){setError(e.message||"Update failed.")}finally{setBusy("")}
  }

  async function handleReject(){
    const reason=rejectReason.trim();
    if(reason.length<5){setError("Please enter a specific rejection reason.");return}
    if(!reviewing)return;
    const paid=reviewing.payment_method==="razorpay"&&reviewing.payment_status==="paid";
    if(paid){
      const ok=window.confirm(`Reject order ${reviewing.order_number} and initiate a full Razorpay refund of ₹${Number(reviewing.total).toFixed(2)}?\\n\\nReason: ${reason}`);
      if(!ok)return;
      await update(reviewing.id,{status:"rejected",rejection_reason:reason,refund:true});
    }else{
      await update(reviewing.id,{status:"rejected",rejection_reason:reason});
    }
  }

  return <main style={s.page}><section style={s.shell}>
    <header style={s.header}><div><div style={s.kicker}>DHIMAN MEDICOS · STAFF</div><h1 style={{margin:"4px 0"}}>Online Store Orders</h1><p style={s.muted}>Review items and prescription before accepting or rejecting an order.</p></div><button onClick={load} style={s.refresh}>↻ Refresh</button></header>
    <div style={s.filters}><button onClick={()=>setFilter("")} style={!filter?s.active:s.chip}>All</button>{Object.keys(labels).map(k=><button key={k} onClick={()=>setFilter(k)} style={filter===k?s.active:s.chip}>{labels[k]}</button>)}</div>
    {error&&<div style={s.alert}>{error}</div>}
    {loading?<div style={s.empty}>Loading…</div>:!orders.length?<div style={s.empty}>No online orders in this view.</div>:<div style={s.list}>{orders.map(o=>{
      const needsRx=o.prescription_status==="pending",checked=Boolean(reviewed[o.id]);
      return <article key={o.id} style={s.card}>
        <div style={s.top}><div><strong>{o.order_number}</strong><small style={s.small}>{new Date(o.created_at).toLocaleString("en-IN")}</small></div><span style={s.badge}>{labels[o.order_status]||o.order_status}</span></div>
        <div style={s.customer}><strong>{o.customer_name}</strong><span>📞 {o.customer_phone}</span><span>{o.delivery_method==="pickup"?"🏪 Store pickup":`🏠 ${o.address_line1}, ${o.city} ${o.pincode}`}</span></div>
        <div style={s.summary}><div><span>Items</span><strong>{(o.items||[]).length} line(s)</strong></div><div><span>Total</span><strong>₹{Number(o.total).toFixed(2)}</strong></div><div><span>Payment</span><strong>{o.payment_method==="razorpay"?`Razorpay · ${o.payment_status}`:"Pay on pickup"}</strong></div><div><span>Prescription</span><strong>{o.prescription_status==="not_required"?"Not required":o.prescription_status}</strong></div></div>
        {o.rejection_reason&&<div style={s.rejectedNote}><strong>Rejection reason:</strong> {o.rejection_reason}</div>}
        <div style={s.actions}>
          <button onClick={()=>openReview(o)} disabled={busy===o.id} style={s.reviewButton}>🔎 Review order & prescription</button>
          {o.order_status==="pending_review"&&!checked&&<span style={s.wait}>Review required before acceptance/rejection.</span>}
          {o.order_status==="pending_review"&&checked&&!needsRx&&<button disabled={busy===o.id||(o.payment_method==="razorpay"&&o.payment_status!=="paid")} onClick={()=>update(o.id,{status:"confirmed"})} style={s.primary}>✓ Accept order</button>}
        </div>
      </article>
    })}</div>}
  </section>
  {reviewing&&<div style={s.overlay}><section style={s.modal}>
    <header style={s.modalHeader}><div><div style={s.kicker}>ORDER REVIEW</div><h2 style={{margin:"4px 0"}}>{reviewing.order_number}</h2><div style={s.muted}>{reviewing.customer_name} · {reviewing.customer_phone}</div></div><button onClick={closeReview} style={s.close}>✕</button></header>
    <section style={s.reviewSection}><h3>Order items</h3><div style={s.items}>{(reviewing.items||[]).map((i,n)=><div key={`${i.medicine_id||i.medicine_name}-${n}`} style={s.itemRow}><div><strong>{i.medicine_name}</strong><small style={s.small}>Qty {i.quantity} · ₹{Number(i.unit_price).toFixed(2)} each</small></div><strong>₹{Number(i.line_total).toFixed(2)}</strong></div>)}</div>
      <div style={s.reviewFacts}><span><b>Fulfilment:</b> {reviewing.delivery_method==="pickup"?"Store pickup":"Home delivery"}</span>{reviewing.delivery_method==="delivery"&&<span><b>Distance:</b> {reviewing.delivery_distance_km!=null?`${Number(reviewing.delivery_distance_km).toFixed(2)} km`:"Not recorded"}</span>}<span><b>Total:</b> ₹{Number(reviewing.total).toFixed(2)}</span><span><b>Payment:</b> {reviewing.payment_method==="razorpay"?`Razorpay · ${reviewing.payment_status}`:"Pay on pickup"}</span></div>
    </section>
    <section style={s.reviewSection}><h3>Prescription</h3>{reviewing.prescription_status==="not_required"?<div style={s.noRx}>No prescription required for this order.</div>:!reviewing.prescription_id?<div style={s.alert}>Prescription required, but no prescription is attached.</div>:rxLoading?<div style={s.noRx}>Opening prescription…</div>:rxUrl?<><div style={s.rxStatus}>Status: <b>{reviewing.prescription_status}</b> · Review the document before deciding.</div><iframe src={rxUrl} title="Customer prescription" style={s.pdf}/><a href={rxUrl} target="_blank" rel="noreferrer" style={s.openRx}>Open prescription in new tab ↗</a></>:<div style={s.alert}>Unable to load the prescription document.</div>}</section>
    {reviewing.order_status==="pending_review"&&<section style={s.confirmReview}>
      <label style={s.checkRow}><input type="checkbox" checked={Boolean(reviewed[reviewing.id])} onChange={e=>{setReviewed(x=>({...x,[reviewing.id]:e.target.checked}));setError("")}}/> I have reviewed the order items and prescription.</label>
      <label style={s.label}>Rejection / review remarks<textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value.slice(0,1000))} placeholder="Enter the reason if you reject the order or prescription." rows={4} style={s.textarea}/></label>
      <div style={s.actions}>
        {reviewing.prescription_status==="pending"&&reviewing.prescription_id&&<><button disabled={busy===reviewing.id||!rxUrl} onClick={()=>update(reviewing.id,{prescription_status:"approved"},true)} style={s.green}>Approve prescription</button><button disabled={busy===reviewing.id||!rxUrl||!rejectReason.trim()} onClick={()=>update(reviewing.id,{prescription_status:"rejected",rejection_reason:rejectReason.trim()})} style={s.red}>Reject prescription</button></>}
        {reviewed[reviewing.id]&&reviewing.prescription_status!=="pending"&&<button disabled={busy===reviewing.id||(reviewing.payment_method==="razorpay"&&reviewing.payment_status!=="paid")} onClick={()=>update(reviewing.id,{status:"confirmed"})} style={s.primary}>✓ Accept reviewed order</button>}
        {reviewed[reviewing.id]&&<button disabled={busy===reviewing.id||!rejectReason.trim()} onClick={handleReject} style={reviewing.payment_method==="razorpay"&&reviewing.payment_status==="paid"?s.refund:s.redStrong}>{reviewing.payment_method==="razorpay"&&reviewing.payment_status==="paid"?"↩ Reject & refund":"✕ Reject order"}</button>}
      </div>
    </section>}
    <button onClick={closeReview} style={s.secondary}>Close review</button>
  </section></div>}
  </main>
}
const s={page:{minHeight:"100vh",padding:20,background:"#f3f7f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},shell:{maxWidth:1100,margin:"0 auto",background:"#fff",border:"1px solid #dfe8e2",borderRadius:24,padding:24,boxShadow:"0 16px 50px rgba(30,55,45,.08)"},header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:18,flexWrap:"wrap"},kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},muted:{color:"#718079",lineHeight:1.5},refresh:{border:"1px solid #d8e2dd",padding:"10px 13px",borderRadius:10,background:"white",fontWeight:800},filters:{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18},chip:{padding:"7px 10px",border:"1px solid #d8e2dd",borderRadius:999,background:"white",color:"#607068"},active:{padding:"7px 10px",border:"1px solid #087f5b",borderRadius:999,background:"#087f5b",color:"white",fontWeight:800},alert:{padding:12,borderRadius:12,background:"#fff0ee",border:"1px solid #e9b6af",color:"#9b3c32",marginBottom:14},empty:{padding:50,textAlign:"center",color:"#77847c"},list:{display:"grid",gap:14},card:{border:"1px solid #e1eae5",borderRadius:18,padding:17,background:"#fff"},top:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"},small:{display:"block",fontSize:11,color:"#7a837c",marginTop:3},badge:{padding:"5px 9px",borderRadius:999,background:"#eff7f1",color:"#126547",fontSize:12,fontWeight:800},customer:{display:"grid",gap:3,margin:"13px 0",color:"#435149"},summary:{display:"grid",gap:7,padding:12,borderRadius:13,background:"#f6f9f7",border:"1px solid #e2eae5"},actions:{display:"flex",gap:8,flexWrap:"wrap",marginTop:12,alignItems:"center"},reviewButton:{padding:"10px 13px",border:"1px solid #b9d9cb",borderRadius:10,background:"#edf8f2",color:"#146344",fontWeight:900},primary:{padding:"10px 13px",border:0,borderRadius:10,background:"#087f5b",color:"#fff",fontWeight:900},green:{padding:"10px 13px",border:0,borderRadius:10,background:"#e8f6ed",color:"#116842",fontWeight:900},red:{padding:"10px 13px",border:"1px solid #e9b6af",borderRadius:10,background:"#fff",color:"#a23c33",fontWeight:900},redStrong:{padding:"10px 13px",border:0,borderRadius:10,background:"#b83b30",color:"#fff",fontWeight:900},refund:{padding:"10px 13px",border:0,borderRadius:10,background:"#9b2f26",color:"#fff",fontWeight:900},secondary:{width:"100%",marginTop:12,padding:"11px 13px",border:"1px solid #d6e1db",borderRadius:10,background:"#fff",fontWeight:800},wait:{fontSize:12,color:"#7b5a27",fontWeight:700},rejectedNote:{marginTop:10,padding:10,borderRadius:10,background:"#fff3f1",color:"#8f3a32",fontSize:13},overlay:{position:"fixed",inset:0,zIndex:1000,background:"rgba(9,26,19,.62)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 12px",overflowY:"auto"},modal:{width:"min(820px,100%)",background:"#fff",borderRadius:20,padding:20},modalHeader:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",paddingBottom:12,borderBottom:"1px solid #e2eae5"},close:{border:0,background:"#f2f5f3",borderRadius:10,padding:"8px 10px",fontWeight:900},reviewSection:{marginTop:16,padding:15,border:"1px solid #e1eae5",borderRadius:15},items:{display:"grid",gap:8},itemRow:{display:"flex",justifyContent:"space-between",gap:14,padding:"9px 0",borderBottom:"1px solid #edf0ee"},reviewFacts:{display:"flex",gap:12,flexWrap:"wrap",marginTop:10,fontSize:13,color:"#596760"},noRx:{padding:12,borderRadius:10,background:"#f4f8f5",color:"#52625a"},rxStatus:{fontSize:13,color:"#56645d",marginBottom:8},pdf:{width:"100%",height:500,border:"1px solid #dbe5df",borderRadius:12,background:"#eef2ef"},openRx:{display:"inline-block",marginTop:8,color:"#087f5b",fontWeight:900,textDecoration:"none"},confirmReview:{marginTop:16,padding:15,borderRadius:15,background:"#f7faf8",border:"1px solid #dfe8e2"},checkRow:{display:"flex",gap:9,alignItems:"flex-start",fontWeight:800,fontSize:14,lineHeight:1.45},label:{display:"grid",gap:6,fontSize:13,fontWeight:800,marginTop:12},textarea:{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #d5dfda",borderRadius:11,fontSize:14,resize:"vertical"}};
