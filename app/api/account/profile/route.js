import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function client(request){
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{
    getAll:()=>request.cookies.getAll(),setAll:()=>{}
  }});
}
function clean(v,max=200){return String(v??"").trim().slice(0,max)}
function phone(v){return String(v??"").replace(/[^0-9+]/g,"").slice(0,15)}

export async function GET(request){
  try{
    const {data:{user},error}=await client(request).auth.getUser();
    if(error)throw error;if(!user)return NextResponse.json({success:false,error:"Customer authentication required."},{status:401});
    const {data,error:e}=await supabaseAdmin.from("customer_profiles").select("id,full_name,phone,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,created_at,updated_at").eq("id",user.id).maybeSingle();
    if(e)throw e;
    return NextResponse.json({success:true,profile:data||{id:user.id,full_name:user.user_metadata?.full_name||"",phone:user.user_metadata?.phone||"",address_line1:"",address_line2:null,landmark:null,city:"Binewal",state:"Punjab",pincode:"144523",latitude:null,longitude:null}},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to load profile."},{status:500})}
}
export async function PUT(request){
  try{
    const {data:{user},error}=await client(request).auth.getUser();
    if(error)throw error;if(!user)return NextResponse.json({success:false,error:"Customer authentication required."},{status:401});
    const b=await request.json(), full_name=clean(b.full_name,120), ph=phone(b.phone);
    if(full_name.length<2)return NextResponse.json({success:false,error:"Please enter your full name."},{status:400});
    if(!/^[0-9+]{10,15}$/.test(ph))return NextResponse.json({success:false,error:"Please enter a valid mobile number."},{status:400});
    const lat=b.latitude===""||b.latitude==null?null:Number(b.latitude),lon=b.longitude===""||b.longitude==null?null:Number(b.longitude);
    if(lat!==null&&(!Number.isFinite(lat)||lat<-90||lat>90))return NextResponse.json({success:false,error:"Invalid latitude."},{status:400});
    if(lon!==null&&(!Number.isFinite(lon)||lon<-180||lon>180))return NextResponse.json({success:false,error:"Invalid longitude."},{status:400});
    const row={id:user.id,full_name,phone:ph,address_line1:clean(b.address_line1,200),address_line2:clean(b.address_line2,200)||null,landmark:clean(b.landmark,160)||null,city:clean(b.city,80)||"Binewal",state:clean(b.state,80)||"Punjab",pincode:clean(b.pincode,6),latitude:lat,longitude:lon,updated_at:new Date().toISOString()};
    if(row.pincode&&!/^\d{6}$/.test(row.pincode))return NextResponse.json({success:false,error:"Please enter a valid 6-digit PIN code."},{status:400});
    const {data,error:e}=await supabaseAdmin.from("customer_profiles").upsert(row,{onConflict:"id"}).select("id,full_name,phone,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,created_at,updated_at").single();
    if(e)throw e;
    await supabaseAdmin.auth.admin.updateUserById(user.id,{user_metadata:{...user.user_metadata,full_name,phone:ph}});
    return NextResponse.json({success:true,profile:data});
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to save profile."},{status:500})}
}
