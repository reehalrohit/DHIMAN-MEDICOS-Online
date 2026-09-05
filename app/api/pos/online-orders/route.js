import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { razorpayRequest } from "../../../../lib/razorpay";

export const dynamic="force-dynamic";
const ALLOWED_STATUS=new Set(["confirmed","preparing","ready","out_for_delivery","delivered","cancelled","rejected"]);
const ALLOWED_PRESCRIPTION=new Set(["approved","rejected"]);

async function loadOrder(id){
  const {data:order,error}=await supabaseAdmin.from("customer_orders").select("*").eq("id",id).maybeSingle();
  if(error)throw error;if(!order)throw new Error("Online order not found.");
  const {data:items,error:itemError}=await supabaseAdmin.from("customer_order_items").select("medicine_id,medicine_name,quantity,unit_price,line_total").eq("order_id",id).order("id",{ascending:true});
  if(itemError)throw itemError;
  return {...order,items:items||[]};
}

export async function GET(request){
  try{
    const {searchParams}=new URL(request.url),status=String(searchParams.get("status")||"").trim();
    let q=supabaseAdmin.from("customer_orders").select("*").order("created_at",{ascending:false}).limit(100);
    if(status)q=q.eq("order_status",status);
    const {data:orders,error}=await q;if(error)throw error;
    const ids=(orders||[]).map(o=>o.id);let items=[];
    if(ids.length){const r=await supabaseAdmin.from("customer_order_items").select("order_id,medicine_id,medicine_name,quantity,unit_price,line_total").in("order_id",ids).order("id",{ascending:true});if(r.error)throw r.error;items=r.data||[]}
    const grouped=new Map();for(const item of items)grouped.set(item.order_id,[...(grouped.get(item.order_id)||[]),item]);
    return NextResponse.json({success:true,orders:(orders||[]).map(o=>({...o,items:grouped.get(o.id)||[]}))},{headers:{"Cache-Control":"no-store,max-age=0"}});
  }catch(error){console.error(error);return NextResponse.json({success:false,error:error?.message||"Unable to load online orders."},{status:500})}
}

export async function PATCH(request){
  try{
    const body=await request.json(),id=String(body?.id||"").trim();
    if(!id)return NextResponse.json({success:false,error:"Order ID is required."},{status:400});
    let order=await loadOrder(id);

    if(body?.prescription_status){
      const next=String(body.prescription_status);
      if(!ALLOWED_PRESCRIPTION.has(next))return NextResponse.json({success:false,error:"Invalid prescription status."},{status:400});
      if(order.prescription_status==="not_required")return NextResponse.json({success:false,error:"This order does not require a prescription."},{status:400});
      if(!order.prescription_id)return NextResponse.json({success:false,error:"No prescription is attached to this order."},{status:400});
      if(next==="rejected"){
        const reason=String(body?.rejection_reason||"").trim().slice(0,1000);
        if(reason.length<5)return NextResponse.json({success:false,error:"A rejection reason is required."},{status:400});
      }
      const {error}=await supabaseAdmin.from("prescriptions").update({status:next,updated_at:new Date().toISOString()}).eq("id",order.prescription_id).eq("order_id",order.id);
      if(error)throw error;
      const changes={prescription_status:next,updated_at:new Date().toISOString()};
      if(next==="rejected")changes.rejection_reason=String(body.rejection_reason).trim().slice(0,1000);
      const {error:oerr}=await supabaseAdmin.from("customer_orders").update(changes).eq("id",order.id);if(oerr)throw oerr;
      await supabaseAdmin.from("customer_order_events").insert({order_id:order.id,status:`prescription_${next}`,note:next==="rejected"?`Prescription rejected: ${changes.rejection_reason}`:`Prescription marked ${next}.`});
      order=await loadOrder(id);
    }

    if(body?.status){
      const next=String(body.status);
      if(!ALLOWED_STATUS.has(next))return NextResponse.json({success:false,error:"Invalid order status."},{status:400});
      if(next==="confirmed"){
        if(order.order_status!=="pending_review")return NextResponse.json({success:false,error:"Only orders awaiting review can be accepted."},{status:409});
        if(order.prescription_status!=="not_required"&&order.prescription_status!=="approved")return NextResponse.json({success:false,error:"Approve the prescription before accepting this order."},{status:409});
        if(order.payment_method==="razorpay"&&order.payment_status!=="paid")return NextResponse.json({success:false,error:"Online payment has not been confirmed yet."},{status:409});
        const rpc=await supabaseAdmin.rpc("confirm_customer_order",{p_order_id:id});if(rpc.error)throw rpc.error;
        await supabaseAdmin.from("customer_order_events").insert({order_id:id,status:"confirmed",note:"Order accepted by pharmacy."});
      }else if(next==="rejected"){
        if(order.order_status!=="pending_review")return NextResponse.json({success:false,error:"Only orders awaiting review can be rejected."},{status:409});
        const reason=String(body?.rejection_reason||"").trim().slice(0,1000);
        if(reason.length<5)return NextResponse.json({success:false,error:"A rejection reason is required."},{status:400});
        let refundId=null;
        if(order.payment_method==="razorpay"&&order.payment_status==="paid"){
          if(!body?.refund)return NextResponse.json({success:false,error:"This paid Razorpay order must be refunded before rejection."},{status:409});
          if(!order.razorpay_payment_id)return NextResponse.json({success:false,error:"Razorpay payment ID is missing; refund cannot be initiated safely."},{status:409});
          if(order.refund_id&&order.refund_status)return NextResponse.json({success:false,error:"A refund has already been initiated for this order."},{status:409});
          const refund=await razorpayRequest(`/payments/${encodeURIComponent(order.razorpay_payment_id)}/refund`,{method:"POST",headers:{"X-Refund-Idempotency":`order-${order.id}-full-refund`},body:JSON.stringify({amount:Math.round(Number(order.total)*100),speed:"optimum",receipt:`refund-${order.order_number}`})});
          refundId=refund?.id||null;
          const refundStatus=refund?.status||"created";
          const {error:re}=await supabaseAdmin.from("customer_orders").update({refund_id:refundId,refund_status:refundStatus,payment_status:refundStatus==="processed"?"refunded":"refunded",updated_at:new Date().toISOString()}).eq("id",id);
          if(re)throw re;
          await supabaseAdmin.from("customer_order_events").insert({order_id:id,status:"payment_refunded",note:`Razorpay refund initiated: ${refundId||"unknown"}. Reason: ${reason}`});
        }
        const {error}=await supabaseAdmin.from("customer_orders").update({order_status:"rejected",rejection_reason:reason,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
        await supabaseAdmin.from("customer_order_events").insert({order_id:id,status:"rejected",note:`Order rejected: ${reason}${refundId?` Refund: ${refundId}`:""}`});
      }else{
        const {error}=await supabaseAdmin.from("customer_orders").update({order_status:next,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
        await supabaseAdmin.from("customer_order_events").insert({order_id:id,status:next,note:`Order status changed to ${next}.`});
      }
    }
    return NextResponse.json({success:true,order:await loadOrder(id)});
  }catch(error){console.error(error);return NextResponse.json({success:false,error:error?.message||"Unable to update online order."},{status:500})}
}
