"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import PrescriptionUploader from "../../components/PrescriptionUploader";
import DeliveryLocationPicker from "../../components/DeliveryLocationPicker";

function loadRazorpay() {
  if (typeof window === "undefined") return Promise.reject(new Error("Payment unavailable."));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", () => reject(new Error("Unable to load secure payment.")), { once: true }); return; }
    const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error("Unable to load secure payment.")); document.body.appendChild(script);
  });
}
const statusLabels={pending_review:"Waiting for pharmacy review",confirmed:"Order confirmed",preparing:"Being prepared",ready:"Ready",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected"};

export default function OnlineOrderPage(){
 const router = useRouter();
 const [user,setUser]=useState(null);
 const [products,setProducts]=useState([]),[query,setQuery]=useState(""),[category,setCategory]=useState("all"),[cart,setCart]=useState({}),[openCheckout,setOpenCheckout]=useState(false),[loading,setLoading]=useState(true),[placing,setPlacing]=useState(false),[message,setMessage]=useState(""),[success,setSuccess]=useState(null),[prescription,setPrescription]=useState(null);
 const [form,setForm]=useState({name:"",phone:"",email:"",address:"",address2:"",landmark:"",city:"Binewal",state:"Punjab",pincode:"144523",notes:"",delivery:"delivery",payment:"cod"});
 const [deliveryLocation,setDeliveryLocation]=useState(null),[locating,setLocating]=useState(false);
 useEffect(()=>{
  getSupabaseBrowserClient().auth.getUser().then(({data})=>{
    const u=data.user||null; setUser(u);
    if(u) setForm(old=>({...old,name:old.name||u.user_metadata?.full_name||"",phone:old.phone||u.user_metadata?.phone||"",email:u.email||old.email}));
  }).catch(()=>{});
  try{setCart(JSON.parse(localStorage.getItem("dm-online-cart")||"{}"));}catch{} fetch("/api/online-orders/catalog",{cache:"no-store"}).then(r=>r.json()).then(d=>{if(!d.success)throw new Error(d.error);setProducts(d.products||[])}).catch(e=>setMessage(e.message||"Unable to load medicines.")).finally(()=>setLoading(false))},[]);
 useEffect(()=>{try{localStorage.setItem("dm-online-cart",JSON.stringify(cart))}catch{}},[cart]);
 const categories=useMemo(()=>[...new Map(products.map(p=>[p.category_id,{id:p.category_id,name:p.category}])).values()],[products]);
 const cartItems = useMemo(() => products.filter(p => cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] })), [products, cart]);
 const total=cartItems.reduce((s,p)=>s+p.mrp*p.quantity,0),requiresPrescription=cartItems.some(p=>p.prescription);
 const filtered=useMemo(()=>products.filter(p=>(category==="all"||p.category_id===category)&&p.name.toLowerCase().includes(query.toLowerCase())),[products,category,query]);
 const setField=(k,v)=>setForm(old=>{
  if(k!=="delivery") return {...old,[k]:v};
  return {...old,delivery:v,payment:v==="delivery"?"razorpay":old.payment};
});
 function requestDeliveryLocation(){
  if(!navigator.geolocation){setMessage("Location is required for home delivery.");return;}
  setLocating(true); setMessage("");
  navigator.geolocation.getCurrentPosition(
    pos=>{setDeliveryLocation({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,source:"gps"});setLocating(false);},
    err=>{setLocating(false);setMessage(err.code===1?"Please allow location access to verify the 2 km delivery area.":"Unable to get your location. Please try again.");},
    {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
  );
}

function updateQty(p,delta){setCart(old=>{const n={...old},v=Math.max(0,Math.min(20,Number(n[p.id]||0)+delta));if(v)n[p.id]=v;else delete n[p.id];return n})}
 async function placeOrder(){
 setMessage("");
 if(!user){router.push(`/login?next=${encodeURIComponent("/online-order")}`);return;}
 if(!cartItems.length)return setMessage("Add at least one medicine to your cart.");
 if(form.delivery==="delivery" && total<199)return setMessage("Home delivery requires a minimum order value of ₹199.");
 if(form.delivery==="delivery" && form.payment!=="razorpay")return setMessage("Home delivery requires online advance payment.");
 if(form.delivery==="delivery" && !deliveryLocation){requestDeliveryLocation();return;}
 if(requiresPrescription&&!prescription)return setMessage("Please upload the prescription before placing this order.");setPlacing(true);try{const r=await fetch("/api/online-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:cartItems.map(p=>({medicine_id:p.id,quantity:p.quantity})),customer_name:form.name,customer_phone:form.phone,customer_email:form.email,address_line1:form.address,address_line2:form.address2,landmark:form.landmark,city:form.city,state:form.state,pincode:form.pincode,notes:form.notes,delivery_method:form.delivery,payment_method:form.payment,delivery_latitude:deliveryLocation?.latitude||null,delivery_longitude:deliveryLocation?.longitude||null,prescription_id:prescription?.id||null})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to place order.");if(form.payment==="razorpay"){await loadRazorpay();const rz=new window.Razorpay({key:d.order.razorpay.key_id,amount:d.order.razorpay.amount,currency:"INR",name:"Dhiman Medicos",description:`Online order ${d.order.order_number}`,order_id:d.order.razorpay.order_id,prefill:{name:form.name,contact:form.phone,email:form.email||undefined},theme:{color:"#075f46"},handler:async(resp)=>{try{const vr=await fetch("/api/online-orders/payment/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(resp)}),vd=await vr.json();if(!vr.ok||!vd.success)throw new Error(vd.error||"Payment verification failed.");setCart({});setSuccess({...d.order,tracking_url:d.tracking_url,payment_status:"paid"});setOpenCheckout(false)}catch(e){setMessage(e.message||"Payment verification failed.")}},modal:{ondismiss:()=>setMessage("Payment window closed. Your order remains awaiting payment confirmation.")}});rz.open();return}setCart({});setSuccess({...d.order,payment_status:"pending"});setOpenCheckout(false)}catch(e){setMessage(e.message||"Unable to place order.")}finally{setPlacing(false)}}
 if(success)return <main style={s.page}><div style={s.success}><div style={s.check}>✓</div><div style={s.kicker}>DHIMAN MEDICOS</div><h1>Order received</h1><p style={s.muted}>Order <strong>{success.order_number}</strong> has been recorded.</p><div style={s.box}><div><span>Status</span><strong>{statusLabels[success.order_status]}</strong></div><div><span>Total</span><strong>₹{Number(success.total).toFixed(2)}</strong></div><div><span>Payment</span><strong>{success.payment_status==="paid"?"Paid online":"Pay on pickup"}</strong></div></div>{success.prescription_status==="pending"&&<div style={s.notice}>📋 Prescription submitted. The pharmacist will review it before confirming the order.</div>}<Link href={success.tracking_url} style={s.primary}>Track your order</Link><button onClick={()=>setSuccess(null)} style={s.secondary}>Continue shopping</button></div></main>;
 return <main style={s.page}><header style={s.header}><div><div style={s.kicker}>DHIMAN MEDICOS</div><h1 style={s.title}>Order Medicines Online</h1><p style={s.muted}>Browse available medicines, add them to your cart, and send the order to the pharmacy.</p></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{user?<Link href="/account" style={s.secondarySmall}>My Account</Link>:<Link href={`/login?next=${encodeURIComponent("/online-order")}`} style={s.secondarySmall}>Sign in</Link>}<Link href="/" style={s.secondarySmall}>← Storefront</Link></div></header><section style={s.search}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search medicines…" style={s.input}/><button onClick={()=>{if(!user){router.push(`/login?next=${encodeURIComponent("/online-order")}`);return;}setOpenCheckout(true)}} disabled={!cartItems.length} style={s.cart}>🛒 Cart ({cartItems.reduce((n,p)=>n+p.quantity,0)}) · ₹{total.toFixed(2)}</button></section><section style={s.chips}><button onClick={()=>setCategory("all")} style={category==="all"?s.active:s.chip}>All</button>{categories.map(c=><button key={c.id} onClick={()=>setCategory(c.id)} style={category===c.id?s.active:s.chip}>{c.name}</button>)}</section>{message&&<div style={s.alert}>{message}</div>}{loading?<div style={s.loading}>Loading medicines…</div>:<section style={s.grid}>{filtered.map(p=><article key={p.id} style={s.card}><div style={s.icon}>{p.category_icon}</div><div style={s.name}>{p.name}</div><div style={s.meta}>{p.category}{p.prescription?" · Rx":""}</div><div style={s.stock}>{p.in_stock?"● In stock":"● Currently unavailable"}</div><div style={s.price}>₹{p.mrp.toFixed(2)}</div>{p.in_stock&&<div style={s.qtyRow}><button onClick={()=>updateQty(p,-1)} style={s.qty}>−</button><span>{cart[p.id]||0}</span><button onClick={()=>updateQty(p,1)} style={s.qty}>+</button></div>}</article>)}</section>}
 {openCheckout&&<div style={s.overlay} onClick={()=>!placing&&setOpenCheckout(false)}><div style={s.modal} onClick={e=>e.stopPropagation()}><div style={s.modalHead}><div><div style={s.kicker}>CHECKOUT</div><h2 style={{margin:0}}>Delivery details</h2></div><button onClick={()=>!placing&&setOpenCheckout(false)} style={s.close}>✕</button></div><div style={s.summary}>{cartItems.map(p=><div key={p.id} style={s.summaryRow}><span>{p.name} × {p.quantity}</span><strong>₹{(p.mrp*p.quantity).toFixed(2)}</strong></div>)}<div style={{...s.summaryRow,borderTop:"1px solid #ddd",paddingTop:10,marginTop:8}}><strong>Total</strong><strong>₹{total.toFixed(2)}</strong></div></div><div style={s.formGrid}><input placeholder="Full name" value={form.name} onChange={e=>setField("name",e.target.value)} style={s.input}/><input placeholder="Mobile number" inputMode="tel" value={form.phone} onChange={e=>setField("phone",e.target.value)} style={s.input}/><input placeholder="Email (optional)" type="email" value={form.email} onChange={e=>setField("email",e.target.value)} style={s.input}/><div style={s.radio}><label><input type="radio" checked={form.delivery==="delivery"} onChange={()=>setField("delivery","delivery")}/> Home delivery</label><label><input type="radio" checked={form.delivery==="pickup"} onChange={()=>setField("delivery","pickup")}/> Store pickup</label></div>{form.delivery==="delivery"&&<><input placeholder="Address" value={form.address} onChange={e=>setField("address",e.target.value)} style={s.input}/><input placeholder="Address line 2 (optional)" value={form.address2} onChange={e=>setField("address2",e.target.value)} style={s.input}/><input placeholder="Landmark (optional)" value={form.landmark} onChange={e=>setField("landmark",e.target.value)} style={s.input}/><div style={s.two}><input placeholder="City" value={form.city} onChange={e=>setField("city",e.target.value)} style={s.input}/><input placeholder="PIN code" inputMode="numeric" value={form.pincode} onChange={e=>setField("pincode",e.target.value)} style={s.input}/></div></>}<textarea placeholder="Notes for the pharmacy (optional)" value={form.notes} onChange={e=>setField("notes",e.target.value)} style={{...s.input,minHeight:80}}/><div style={s.payment}>
<strong>Payment</strong>
{form.delivery==="delivery" ? (
 <>
  <div style={{fontSize:13,color:"#0e5938",fontWeight:700}}>🚚 Home delivery: online advance payment only.</div>
  <label><input type="radio" checked={form.payment==="razorpay"} onChange={()=>setField("payment","razorpay")}/> Pay online with Razorpay</label>
  <div style={{fontSize:12,color:"#6b756f"}}>Minimum order for delivery: ₹199.</div>
 </>
) : (
 <>
  <div style={{fontSize:13,color:"#0e5938",fontWeight:700}}>🏪 Store pickup: choose either payment method.</div>
  <label><input type="radio" checked={form.payment==="cod"} onChange={()=>setField("payment","cod")}/> Pay on pickup</label>
  <label><input type="radio" checked={form.payment==="razorpay"} onChange={()=>setField("payment","razorpay")}/> Pay online with Razorpay</label>
 </>
)}
</div></div>{requiresPrescription&&<PrescriptionUploader prescription={prescription} onChange={setPrescription} disabled={placing}/>}{form.delivery==="delivery" && (
  <div style={{padding:12,borderRadius:12,background:"#f2f6f3",border:"1px solid #d7e3db"}}>
    <div style={{fontWeight:800,marginBottom:5}}>📍 Home delivery area</div>
    <div style={{fontSize:12,color:"#657168"}}>Delivery is available within 2 km of Dhiman Medicos. Your location is used only to check serviceability.</div>
    <button type="button" onClick={requestDeliveryLocation} disabled={locating||placing} style={s.secondary}>
      {locating ? "Checking GPS…" : deliveryLocation ? "✓ GPS location captured — recapture" : "Use my current GPS"}
    </button>
    <div style={{marginTop:10}}>
      <DeliveryLocationPicker
        value={deliveryLocation}
        onChange={(loc)=>setDeliveryLocation(loc)}
        disabled={placing}
      />
    </div>
    {total<199 && <div style={{fontSize:12,color:"#a33f34",marginTop:7}}>Add ₹{(199-total).toFixed(2)} more for delivery.</div>}
  </div>
)}
<button onClick={placeOrder} disabled={placing || (form.delivery==="delivery" && (total<199 || !deliveryLocation || form.payment!=="razorpay"))} style={s.primary}>{placing?"Processing…":form.payment==="razorpay"?"Pay & place order":"Place order"}</button></div></div>}
 </main>
}
const s={page:{minHeight:"100vh",background:"#faf7f0",color:"#16241b",fontFamily:"Inter,system-ui,sans-serif",padding:"24px 16px 60px"},header:{maxWidth:1200,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",flexWrap:"wrap"},kicker:{fontSize:11,fontWeight:900,letterSpacing:2,color:"#0e5938"},title:{fontSize:"clamp(2rem,5vw,3rem)",margin:"4px 0 8px",letterSpacing:"-.03em"},muted:{color:"#657168",lineHeight:1.6},search:{maxWidth:1200,margin:"0 auto 12px",display:"flex",gap:10},input:{width:"100%",border:"1px solid #d9ded7",borderRadius:12,padding:"12px 13px",fontSize:14,background:"#fffdf9",boxSizing:"border-box"},cart:{whiteSpace:"nowrap",border:0,borderRadius:12,padding:"0 17px",background:"#0e5938",color:"white",fontWeight:800},chips:{maxWidth:1200,margin:"0 auto 20px",display:"flex",gap:8,flexWrap:"wrap"},chip:{padding:"8px 12px",borderRadius:999,border:"1px solid #d8ded8",background:"#fffdf9",color:"#57625b"},active:{padding:"8px 12px",borderRadius:999,border:"1px solid #0e5938",background:"#0e5938",color:"white",fontWeight:800},grid:{maxWidth:1200,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:13},card:{background:"#fffdf9",border:"1px solid #e7e0cf",borderRadius:16,padding:17,boxShadow:"0 3px 12px rgba(11,42,28,.05)"},icon:{fontSize:28},name:{fontWeight:800,marginTop:7,lineHeight:1.35},meta:{fontSize:12,color:"#7a837c",marginTop:4},stock:{fontSize:12,marginTop:10,color:"#0e7b4a"},price:{fontWeight:900,fontSize:20,marginTop:7},qtyRow:{marginTop:12,display:"flex",alignItems:"center",justifyContent:"space-between",border:"1px solid #d8ded8",borderRadius:11,padding:4},qty:{width:36,height:34,borderRadius:8,background:"#edf5ef",fontSize:20},alert:{maxWidth:1200,margin:"0 auto 15px",padding:12,borderRadius:12,background:"#fff0ee",border:"1px solid #e9b6af",color:"#a33f34"},loading:{maxWidth:1200,margin:"50px auto",textAlign:"center",color:"#6f7a70"},overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.48)",display:"flex",justifyContent:"center",alignItems:"flex-end",zIndex:1000},modal:{width:"min(760px,100%)",maxHeight:"92dvh",overflowY:"auto",background:"#fffdf9",borderRadius:"22px 22px 0 0",padding:22,boxSizing:"border-box"},modalHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16},close:{fontSize:22,padding:4},summary:{border:"1px solid #e5e1d6",borderRadius:14,padding:13,marginBottom:15},summaryRow:{display:"flex",justifyContent:"space-between",gap:12,padding:"5px 0",fontSize:14},formGrid:{display:"grid",gap:10},radio:{display:"flex",gap:18,flexWrap:"wrap",padding:"3px 0"},two:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},payment:{display:"grid",gap:8,padding:13,borderRadius:13,background:"#f2f6f3"},primary:{display:"inline-flex",justifyContent:"center",alignItems:"center",width:"100%",padding:"13px 16px",borderRadius:12,border:0,background:"#0e5938",color:"white",fontWeight:900,textDecoration:"none"},secondary:{display:"inline-flex",justifyContent:"center",alignItems:"center",width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid #d8ded8",background:"#fffdf9",fontWeight:800},secondarySmall:{display:"inline-flex",justifyContent:"center",alignItems:"center",padding:"11px 14px",borderRadius:12,border:"1px solid #d8ded8",background:"#fffdf9",fontWeight:800,textDecoration:"none",color:"inherit"},success:{maxWidth:560,margin:"8vh auto",background:"#fffdf9",border:"1px solid #e7e0cf",borderRadius:22,padding:28,boxShadow:"0 14px 45px rgba(11,42,28,.1)"},check:{width:54,height:54,borderRadius:"50%",display:"grid",placeItems:"center",background:"#eaf6ee",color:"#0e7b4a",fontSize:30,fontWeight:900},box:{display:"grid",gap:10,background:"#f2f6f3",borderRadius:14,padding:15,margin:"17px 0"},notice:{padding:12,borderRadius:12,background:"#fff6e8",color:"#7d5620",marginBottom:15}}
