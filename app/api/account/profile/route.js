import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function client(request) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
}

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function phone(value) {
  return String(value ?? "")
    .replace(/[^0-9+]/g, "")
    .slice(0, 15);
}

function validLatLng(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export async function GET(request) {
  try {
    const {
      data: { user },
      error: authError,
    } = await client(request).auth.getUser();

    if (authError) throw authError;

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer authentication required.",
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customer_profiles")
      .select(
        "id,full_name,phone,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,created_at,updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        profile:
          data || {
            id: user.id,
            full_name:
              user.user_metadata?.full_name || "",
            phone:
              user.user_metadata?.phone || "",
            address_line1: "",
            address_line2: null,
            landmark: null,
            city: "Binewal",
            state: "Punjab",
            pincode: "144523",
            latitude: null,
            longitude: null,
          },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load profile.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const {
      data: { user },
      error: authError,
    } = await client(request).auth.getUser();

    if (authError) throw authError;

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer authentication required.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const full_name = clean(
      body.full_name,
      120
    );

    const ph = phone(body.phone);

    if (full_name.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter your full name.",
        },
        { status: 400 }
      );
    }

    if (
      !/^[0-9+]{10,15}$/.test(ph)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter a valid mobile number.",
        },
        { status: 400 }
      );
    }

    const lat =
      body.latitude === "" ||
      body.latitude == null
        ? null
        : Number(body.latitude);

    const lon =
      body.longitude === "" ||
      body.longitude == null
        ? null
        : Number(body.longitude);

    if (
      (lat !== null || lon !== null) &&
      !validLatLng(
        lat,
        lon
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please provide valid GPS coordinates.",
        },
        { status: 400 }
      );
    }

    const pincode = clean(
      body.pincode,
      6
    );

    if (
      pincode &&
      !/^\d{6}$/.test(pincode)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter a valid 6-digit PIN code.",
        },
        { status: 400 }
      );
    }

    const row = {
      id: user.id,
      full_name,
      phone: ph,
      address_line1: clean(
        body.address_line1,
        200
      ),
      address_line2:
        clean(
          body.address_line2,
          200
        ) || null,
      landmark:
        clean(
          body.landmark,
          160
        ) || null,
      city:
        clean(
          body.city,
          80
        ) || "Binewal",
      state:
        clean(
          body.state,
          80
        ) || "Punjab",
      pincode,
      latitude: lat,
      longitude: lon,
      updated_at:
        new Date().toISOString(),
    };

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("customer_profiles")
      .upsert(row, {
        onConflict: "id",
      })
      .select(
        "id,full_name,phone,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,created_at,updated_at"
      )
      .single();

    if (error) throw error;

    await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          full_name,
          phone: ph,
        },
      }
    );

    return NextResponse.json({
      success: true,
      profile: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to save profile.",
      },
      { status: 500 }
    );
  }
}
