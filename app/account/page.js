"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import DeliveryLocationPicker from "../../components/DeliveryLocationPicker";

const empty = {full_name:"",phone:"",address_line1:"",address_line2:"",landmark:"",city:"Binewal",state:"Punjab",pincode:"144523",latitude:null,longitude:null};
const labels = {pending_review:"Waiting for pharmacy review",confirmed:"Order confirmed",preparing:"Being prepared",ready:"Ready",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected"};

export default function AccountPage(){
  const router=useRouter();
  const [user,setUser]=useState(null),[profile,setProfile]=useState(empty),[orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[passwordOpen,setPasswordOpen]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");

  useEffect(()=>{let active=true;(async()=>{
    try{
      const sb=getSupabaseBrowserClient();
      const {data:{user},error:uerr}=await sb.auth.getUser();
      if(uerr)throw uerr;
      if(!user){router.replace("/login?next=/account");return;}
      const [pr,or]=await Promise.all([
        fetch("/api/account/profile",{cache:"no-store"}),
        fetch("/api/account/orders",{cache:"no-store"})
      ]);
      const pd=await pr.json(), od=await or.json();
      if(!pr.ok||!pd.success)throw new Error(pd.error||"Unable to load profile.");
      if(!or.ok||!od.success)throw new Error(od.error||"Unable to load orders.");
      if(active){setUser(user);setProfile({...empty,...pd.profile});setOrders(od.orders||[]);}
    }catch(e){if(active)setError(e.message||"Unable to load account.");}
    finally{if(active)setLoading(false);}
  })();return()=>{active=false}},[router]);

  const field=(k,v)=>setProfile(p=>({...p,[k]:v}));
  async function save(e){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const r=await fetch("/api/account/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(profile)});
      const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to save profile.");
      setProfile({...empty,...d.profile});setMessage("Profile saved successfully.");
    }catch(e){setError(e.message||"Unable to save profile.");}finally{setSaving(false);}
  }
  async function changePassword(e){
    e.preventDefault();setError("");setMessage("");
    const p=e.currentTarget.password.value,c=e.currentTarget.confirm.value;
    if(p.length<6)return setError("Password must be at least 6 characters.");
    if(p!==c)return setError("Passwords do not match.");
    try{const {error}=await getSupabaseBrowserClient().auth.updateUser({password:p});if(error)throw error;e.currentTarget.reset();setPasswordOpen(false);setMessage("Password changed successfully.");}
    catch(e){setError(e.message||"Unable to change password.");}
  }
  async function signOut(){await getSupabaseBrowserClient().auth.signOut();router.replace("/online-order");router.refresh();}

  if(loading)return <main style={s.page}><section style={s.card}>Loading account…</section></main>;

  return <main style={s.page}><div style={s.shell}>
    <header style={s.header}><div><div style={s.kicker}>DHIMAN MEDICOS</div><h1 style={{margin:"5px 0"}}>My Account</h1><p style={s.muted}>{user?.email}</p></div><div style={s.actions}><Link href="/online-order" style={s.button}>Order medicines</Link><button onClick={signOut} style={s.button}>Sign out</button></div></header>
    {error&&<div style={s.error}>{error}</div>}{message&&<div style={s.success}>{message}</div>}
    <div style={s.grid}>
      <section style={s.section}><div style={s.kicker}>PROFILE</div><h2 style={s.h2}>Personal details</h2>
        <form onSubmit={save} style={s.form}>
          <div style={s.two}><label style={s.label}>Full name<input style={s.input} value={profile.full_name} onChange={e=>field("full_name",e.target.value)} required/></label><label style={s.label}>Mobile<input style={s.input} value={profile.phone} onChange={e=>field("phone",e.target.value)} inputMode="tel" required/></label></div>
          <label style={s.label}>Email<input style={{...s.input,background:"#f2f5f2"}} value={user?.email||""} disabled/></label>
          <hr style={s.hr}/>
          <div><div style={s.kicker}>SAVED DELIVERY ADDRESS</div><div style={s.hint}>Your delivery address is saved for convenience. Checkout still requires your current GPS check.</div></div>
          <label style={s.label}>Address<input style={s.input} value={profile.address_line1} onChange={e=>field("address_line1",e.target.value)} placeholder="House / street / village"/></label>
          <label style={s.label}>Address line 2<input style={s.input} value={profile.address_line2||""} onChange={e=>field("address_line2",e.target.value)} placeholder="Area / apartment (optional)"/></label>
          <label style={s.label}>Landmark<input style={s.input} value={profile.landmark||""} onChange={e=>field("landmark",e.target.value)} placeholder="Nearby landmark (optional)"/></label>
          <div style={s.three}><label style={s.label}>City<input style={s.input} value={profile.city} onChange={e=>field("city",e.target.value)}/></label><label style={s.label}>State<input style={s.input} value={profile.state} onChange={e=>field("state",e.target.value)}/></label><label style={s.label}>PIN<input style={s.input} value={profile.pincode} onChange={e=>field("pincode",e.target.value)} inputMode="numeric"/></label></div>
          <div style={s.location}><strong>📍 Saved delivery pin</strong><div style={s.hint}>Optional saved navigation point. Current GPS is still checked at delivery checkout.</div>
          <DeliveryLocationPicker value={profile.latitude&&profile.longitude?{latitude:profile.latitude,longitude:profile.longitude}:null} onChange={v=>{field("latitude",v.latitude);field("longitude",v.longitude)}} disabled={saving}/></div>
          <button type="submit" disabled={saving} style={s.primary}>{saving?"Saving…":"Save profile"}</button>
        </form>
      </section>
      <aside style={s.side}>
        <section style={s.section}><div style={s.kicker}>SECURITY</div><h2 style={s.h2}>Password</h2>{!passwordOpen?<button style={s.secondary} onClick={()=>setPasswordOpen(true)}>Change password</button>:<form onSubmit={changePassword} style={s.form}><input name="password" type="password" minLength="6" placeholder="New password" style={s.input} required/><input name="confirm" type="password" minLength="6" placeholder="Confirm password" style={s.input} required/><button style={s.primary}>Update password</button></form>}</section>
        <section style={s.section}><div style={s.kicker}>LEGAL</div><h2 style={s.h2}>Policies</h2><div style={s.links}><Link href="/privacy" style={s.button}>Privacy Policy</Link><Link href="/terms" style={s.button}>Terms & Conditions</Link></div></section>
      </aside>
    </div>
    <section style={{...s.section,marginTop:18}}><div style={s.kicker}>ORDERS</div><h2 style={s.h2}>My orders</h2>{!orders.length?<div style={s.empty}>No online orders yet.</div>:<div style={s.list}>{orders.map(o=><article key={o.id} style={s.order}><div style={s.row}><strong>{o.order_number}</strong><span style={s.badge}>{labels[o.order_status]||o.order_status}</span></div><div style={s.meta}>Placed {new Date(o.created_at).toLocaleString("en-IN")}</div><div style={s.row}><span>{o.delivery_method==="pickup"?"Store pickup":"Home delivery"}</span><strong>₹{Number(o.total).toFixed(2)}</strong></div><div style={s.meta}>{o.payment_method==="razorpay"?`Razorpay · ${o.payment_status}`:"Pay on pickup"}</div><Link href={`/order/${o.tracking_token}`} style={s.track}>Track order →</Link></article>)}</div>}</section>
  </div></main>;
}

const s={page:{minHeight:"100vh",padding:20,background:"#f3f8f5",fontFamily:"system-ui,sans-serif",color:"#17211d"},shell:{maxWidth:1100,margin:"0 auto"},card:{maxWidth:430,margin:"20vh auto",background:"white",padding:30,borderRadius:20,textAlign:"center"},header:{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap",marginBottom:18,padding:20,background:"white",border:"1px solid #dfe8e2",borderRadius:22},grid:{display:"grid",gridTemplateColumns:"minmax(0,1.7fr) minmax(280px,.8fr)",gap:18},side:{display:"grid",gap:18,alignContent:"start"},section:{background:"white",border:"1px solid #dfe8e2",borderRadius:20,padding:20},kicker:{fontSize:11,letterSpacing:2,fontWeight:900,color:"#087f5b"},h2:{fontSize:20,margin:"5px 0 16px"},muted:{color:"#6d7b73"},hint:{fontSize:12,color:"#748078",lineHeight:1.45,marginTop:5},form:{display:"grid",gap:12},label:{display:"grid",gap:6,fontSize:13,fontWeight:700},input:{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #d7e1dc",borderRadius:11,fontSize:15,background:"#fff"},two:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},three:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10},location:{padding:13,borderRadius:14,border:"1px solid #dfe8e2",background:"#f7faf8"},row:{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"},actions:{display:"flex",gap:8,flexWrap:"wrap"},links:{display:"grid",gap:8},button:{padding:"10px 13px",border:"1px solid #d6e0da",borderRadius:10,background:"white",color:"inherit",textDecoration:"none",fontWeight:800,textAlign:"center"},primary:{padding:13,border:0,borderRadius:12,background:"#087f5b",color:"white",fontWeight:900,fontSize:15,width:"100%"},secondary:{padding:11,border:"1px solid #d6e0da",borderRadius:10,background:"white",fontWeight:800,width:"100%"},hr:{border:0,borderTop:"1px solid #e5ece8",margin:"4px 0"},badge:{padding:"5px 9px",borderRadius:999,background:"#eff7f1",color:"#126547",fontSize:12,fontWeight:800},list:{display:"grid",gap:12},order:{border:"1px solid #e1eae5",borderRadius:16,padding:16},meta:{fontSize:12,color:"#748078",margin:"6px 0 12px"},track:{color:"#087f5b",fontWeight:900,textDecoration:"none"},empty:{padding:30,textAlign:"center",color:"#77847c"},error:{padding:12,borderRadius:11,background:"#fff0ee",color:"#9b3c32",marginBottom:15},success:{padding:12,borderRadius:11,background:"#edf8f1",color:"#205d45",marginBottom:15}};
