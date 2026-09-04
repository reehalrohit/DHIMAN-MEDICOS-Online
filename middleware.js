import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

function isProtectedPath(pathname) {
  // Admin login must remain public.
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return false;
  }

  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/pos" ||
    pathname.startsWith("/pos/") ||
    pathname === "/sales" ||
    pathname.startsWith("/sales/") ||
    pathname === "/inventory" ||
    pathname.startsWith("/inventory/")
  ) {
    return true;
  }

  // Protect internal POS and inventory APIs.
  // Public Razorpay customer endpoints and webhook are not included.
  return (
    pathname === "/api/pos" ||
    pathname.startsWith("/api/pos/") ||
    pathname === "/api/inventory" ||
    pathname.startsWith("/api/inventory/")
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Admin access is controlled by Supabase app_metadata.
  // The user's app_metadata contains: { "role": "admin" }
  const isAdmin = user?.app_metadata?.role === "admin";

  if (!isAdmin) {
    // API clients receive JSON instead of an HTML redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin authentication required.",
        },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search || ""}`
    );

    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/pos/:path*",
    "/sales/:path*",
    "/inventory/:path*",
    "/api/pos/:path*",
    "/api/inventory/:path*",
  ],
};
