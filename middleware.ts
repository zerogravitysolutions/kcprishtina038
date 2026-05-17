import { type NextRequest, NextResponse } from "next/server";

const STAFF_ROLES = new Set(["admin", "editor", "staff", "coach"]);

export async function middleware(request: NextRequest) {
  try {
    return await runMiddleware(request);
  } catch (e) {
    // Last-resort safety net: never let middleware crash the request.
    // Logged to Vercel's runtime logs; production keeps serving.
    console.error("[middleware] failed, falling through:", e);
    return NextResponse.next({ request });
  }
}

async function runMiddleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Degraded mode: env vars not set. Pass through.
    return response;
  }

  // Dynamic import keeps the supabase-js bundle out of middleware cold start
  // when env vars are missing (and also catches an import error gracefully).
  const { createServerClient } = await import("@supabase/ssr");

  type CookieSet = { name: string; value: string; options?: Record<string, unknown> };
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/admin") || path.startsWith("/portal");

  if (isProtected && !user) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("next", path);
    return NextResponse.redirect(u);
  }

  if (path.startsWith("/admin") && user) {
    const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
    const profile = data as { role: string; status: string } | null;
    const allowed = !!profile && profile.status === "active" && STAFF_ROLES.has(profile.role);
    if (!allowed) {
      const u = request.nextUrl.clone();
      u.pathname = profile?.role === "member" ? "/portal" : "/login";
      return NextResponse.redirect(u);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|ico|css|js|woff2?|ttf|webp|avif|txt|xml)$).*)"],
};
