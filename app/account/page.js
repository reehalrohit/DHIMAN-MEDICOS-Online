"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

const labels={pending_review:"Waiting for pharmacy review",confirmed:"Order confirmed",preparing:"Being prepared",ready:"Ready",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected"};

export default function AccountPage(){
  const router=useRouter();
  const [user,setUser]=useState(null),[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{user},error:userError}=await supabase.auth.getUser();
        if(userError)throw userError;
        if(!user){router.replace("/login?next=/account");return;}
        const {data,error:ordersError}=await supabase.from("customer_orders").select("id,order_number,tracking_token,total,payment_method,payment_status,order_status,prescription_status,delivery_method,created_at").order("created_at",{ascending:false});
        if(ordersError)throw ordersError;
        if(active){setUser(user);setOrders(data||[]);}
      }catch(e){if(active)setError(e.message||"Unable to load account.");}
      finally{if(active)setLoading(false);}
    }
    load();
    return()=>{active=false;};
  },[router]);
  async function signOut(){await getSupabaseBrowserClient().auth.signOut();router.replace("/online-order");router.refresh();}
  if(loading)return <main style={s.page}><section style={s.card}>Loading account…</section></main>;
  return <main style={s.page}><section style={s.shell}><header style={s.header}><div><div style={s.kicker}>DHIMAN MEDICOS</div><h1 style={{margin:"5px 0"}}>My Account</h1><p style={s.muted}>{user?.email}</p></div><div style={s.actions}><Link href="/online-order" style={s.button}>Order medicines</Link><button onClick={signOut} style={s.button}>Sign out</button></div></header>{error&&<div style={s.error}>{error}</div>}<h2>My orders</h2>{!orders.length?<div style={s.empty}>No online orders yet.</div>:<div style={s.list}>{orders.map(o=><article key={o.id} style={s.order}><div style={s.row}><strong>{o.order_number}</strong><span style={s.badge}>{labels[o.order_status]||o.order_status}</span></div><div style={s.meta}>Placed {new Date(o.created_at).toLocaleString("en-IN")}</div><div style={s.row}><span>{o.delivery_method==="pickup"?"Store pickup":"Home delivery"}</span><strong>₹{Number(o.total).toFixed(2)}</strong></div><div style={s.meta}>{o.payment_method==="razorpay"?`Razorpay · ${o.payment_status}`:"Cash on delivery / pickup"}{o.prescription_status!=="not_required"?` · Prescription ${o.prescription_status}`:""}</div><Link href={`/order/${o.tracking_token}`} style={s.track}>Track order →</Link></article>)}</div>}</section></main>;
}
const s={page:{minHeight:"100vh",padding:20,background:"#f3f8f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},shell:{maxWidth:900,margin:"0 auto",background:"white",border:"1px solid #dfe8e2",borderRadius:24,padding:24},card:{maxWidth:430,margin:"20vh auto",background:"white",padding:30,borderRadius:20,textAlign:"center"},header:{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap",marginBottom:25},kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},muted:{color:"#6d7b73"},actions:{display:"flex",gap:8,flexWrap:"wrap"},button:{padding:"10px 13px",border:"1px solid #d6e0da",borderRadius:10,background:"white",color:"inherit",textDecoration:"none",fontWeight:800},list:{display:"grid",gap:12},order:{border:"1px solid #e1eae5",borderRadius:16,padding:16},row:{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"},badge:{padding:"5px 9px",borderRadius:999,background:"#eff7f1",color:"#126547",fontSize:12,fontWeight:800},meta:{fontSize:12,color:"#748078",margin:"6px 0 12px"},track:{color:"#087f5b",fontWeight:900,textDecoration:"none"},empty:{padding:50,textAlign:"center",color:"#77847c"},error:{padding:12,borderRadius:11,background:"#fff0ee",color:"#9b3c32",marginBottom:15}};
