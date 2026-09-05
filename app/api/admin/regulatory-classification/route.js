import { NextResponse } from "next/server";
import { CATALOG } from "../../../../lib/medicines";
import { medicineKey } from "../../../../lib/inventory";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function client(request) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
}

async function admin(request) {
  const { data: { user }, error } = await client(request).auth.getUser();
  if (error) throw error;
  return user?.app_metadata?.role === "admin";
}

function products() {
  const seen = new Set(), list = [];
  for (const c of CATALOG || []) for (const m of c?.items || []) {
    const name = String(m?.name || "").trim(), mrp = Number(m?.mrp);
    if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;
    const id = medicineKey(name);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name, category: c.name, legacy_prescription: Boolean(m.prescription) });
  }
  return list;
}

export async function GET(request) {
  try {
    if (!(await admin(request))) return NextResponse.json({ success:false,error:"Admin authentication required." }, { status:401 });
    const { data, error } = await supabaseAdmin.from("medicine_regulatory_classification").select("medicine_id,schedule,nrx,notes,updated_at");
    if (error) throw error;
    const map = new Map((data||[]).map(r=>[String(r.medicine_id),r]));
    return NextResponse.json({
      success:true,
      products:products().map(p=>({ ...p, schedule:map.get(p.id)?.schedule||null, nrx:Boolean(map.get(p.id)?.nrx), notes:map.get(p.id)?.notes||"", updated_at:map.get(p.id)?.updated_at||null }))
    });
  } catch(e) {
    return NextResponse.json({ success:false,error:e.message||"Unable to load classifications." }, { status:500 });
  }
}

export async function PUT(request) {
  try {
    if (!(await admin(request))) return NextResponse.json({ success:false,error:"Admin authentication required." }, { status:401 });
    const b=await request.json();
    const medicine_id=String(b?.medicine_id||"").trim();
    const schedule=b?.schedule==="H"||b?.schedule==="H1"?b.schedule:null;
    const nrx=Boolean(b?.nrx);
    const notes=String(b?.notes||"").trim().slice(0,500);
    if(!medicine_id) return NextResponse.json({success:false,error:"Medicine ID is required."},{status:400});
    const {error}=await supabaseAdmin.from("medicine_regulatory_classification").upsert(
      {medicine_id,schedule,nrx,notes:notes||null,updated_at:new Date().toISOString()},
      {onConflict:"medicine_id"}
    );
    if(error) throw error;
    return NextResponse.json({success:true});
  } catch(e) {
    return NextResponse.json({success:false,error:e.message||"Unable to save classification."},{status:500});
  }
}
