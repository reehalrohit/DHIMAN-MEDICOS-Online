import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const response = NextResponse.json({ success: false });
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll(){ return request.cookies.getAll(); },
        setAll(cookiesToSet){ cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options)); }
      }
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({success:false,error:"Customer authentication required."},{status:401});
    const { data: orders, error } = await supabase.from("customer_orders").select("id,order_number,tracking_token,total,payment_method,payment_status,order_status,prescription_status,delivery_method,created_at").order("created_at",{ascending:false});
    if(error)throw error;
    return NextResponse.json({success:true,orders:orders||[]},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return NextResponse.json({success:false,error:error?.message||"Unable to load orders."},{status:500}); }
}
