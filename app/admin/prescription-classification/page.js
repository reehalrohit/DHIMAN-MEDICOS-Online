"use client";
import { useEffect, useMemo, useState } from "react";

export default function PrescriptionClassification() {
  const [rows,setRows]=useState([]),[q,setQ]=useState(""),[filter,setFilter]=useState("all");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");

  useEffect(()=>{fetch("/api/admin/regulatory-classification",{cache:"no-store"})
    .then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to load medicines.");setRows(d.products||[])})
    .catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);

  const shown=useMemo(()=>{const term=q.trim().toLowerCase();return rows.filter(r=>{
    const text=!term||r.name.toLowerCase().includes(term)||r.category.toLowerCase().includes(term);
    const classified=Boolean(r.schedule)||r.nrx;
    const ok=filter==="all"||(filter==="classified"&&classified)||(filter==="unclassified"&&!classified)||(filter==="legacy-rx"&&r.legacy_prescription);
    return text&&ok;
  })},[rows,q,filter]);

  const update=(id,key,value)=>setRows(rs=>rs.map(r=>r.id===id?{...r,[key]:value}:r));
  async function save(r){setSaving(r.id);setError("");setMessage("");try{
    const res=await fetch("/api/admin/regulatory-classification",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({medicine_id:r.id,schedule:r.schedule||null,nrx:Boolean(r.nrx),notes:r.notes||""})});
    const d=await res.json();if(!res.ok||!d.success)throw new Error(d.error||"Unable to save.");setMessage(`${r.name} saved.`);
  }catch(e){setError(e.message||"Unable to save.")}finally{setSaving("")}}

  return <main style={s.page}><div style={s.shell}>
    <header style={s.head}><div style={s.kicker}>DHIMAN MEDICOS · ADMIN</div><h1 style={s.title}>Prescription Classification</h1><p style={s.muted}>Classify medicines using verified pharmacy/regulatory records.</p></header>
    {error&&<div style={s.error}>{error}</div>}{message&&<div style={s.success}>{message}</div>}
    <div style={s.toolbar}><input style={s.input} placeholder="Search medicine or category…" value={q} onChange={e=>setQ(e.target.value)}/><select style={s.input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All medicines</option><option value="classified">Classified H / H1 / NRx</option><option value="unclassified">Unclassified</option><option value="legacy-rx">Existing Rx flag</option></select></div>
    {loading?<section style={s.card}>Loading medicines…</section>:<section style={s.card}><div style={s.count}>Showing {shown.length} of {rows.length}</div><div style={s.list}>{shown.map(r=><article key={r.id} style={s.row}><div style={s.info}><strong>{r.name}</strong><span>{r.category}</span>{r.legacy_prescription&&<small>Existing prescription flag</small>}</div><div style={s.controls}><select style={s.input} value={r.schedule||""} onChange={e=>update(r.id,"schedule",e.target.value||null)}><option value="">No H/H1</option><option value="H">Schedule H</option><option value="H1">Schedule H1</option></select><label style={s.check}><input type="checkbox" checked={Boolean(r.nrx)} onChange={e=>update(r.id,"nrx",e.target.checked)}/> NRx</label><input style={s.input} placeholder="Note" value={r.notes||""} onChange={e=>update(r.id,"notes",e.target.value)}/><button style={s.save} disabled={saving===r.id} onClick={()=>save(r)}>{saving===r.id?"Saving…":"Save"}</button></div></article>)}</div></section>}
  </div></main>
}
const s={page:{minHeight:"100vh",padding:"24px 16px 50px",background:"#f3f8f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},shell:{maxWidth:1200,margin:"0 auto"},head:{background:"#fff",border:"1px solid #dfe8e2",borderRadius:20,padding:20,marginBottom:16},kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},title:{margin:"5px 0",fontSize:"clamp(1.8rem,5vw,2.6rem)"},muted:{color:"#6d7b73",lineHeight:1.5},toolbar:{display:"grid",gridTemplateColumns:"minmax(0,1fr) 260px",gap:10,marginBottom:16},input:{width:"100%",boxSizing:"border-box",padding:11,border:"1px solid #d7e1dc",borderRadius:11,background:"#fff",fontSize:14},card:{background:"#fff",border:"1px solid #dfe8e2",borderRadius:20,padding:16},count:{color:"#6d7b73",fontSize:13,marginBottom:10},list:{display:"grid",gap:10},row:{display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(420px,2fr)",gap:14,alignItems:"center",padding:13,border:"1px solid #e3ebe7",borderRadius:14},info:{display:"grid",gap:4},controls:{display:"grid",gridTemplateColumns:"140px 80px minmax(120px,1fr) 74px",gap:8,alignItems:"center"},check:{fontSize:13,fontWeight:800,display:"flex",gap:5},save:{padding:11,border:0,borderRadius:10,background:"#087f5b",color:"#fff",fontWeight:900},error:{padding:12,borderRadius:11,background:"#fff0ee",color:"#9b3c32",marginBottom:15},success:{padding:12,borderRadius:11,background:"#edf8f1",color:"#205d45",marginBottom:15}}
