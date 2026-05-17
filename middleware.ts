import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database, UserRole } from "@/lib/supabase/types";

const STAFF_ROLES: UserRole[] = ["admin", "editor", "staff", "coach"];

type CookieSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Fail-safe: if Supabase env vars are missing on this deployment, skip
  // auth checks rather than crash. Public pages stay reachable; protected
  // routes fall through to the page (which itself redirects to /login).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("[middleware] Supabase env vars missing — auth checks bypassed.");
    return response;
  }

  const supabase = createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieSet[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/admin") || path.startsWith("/portal");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/admin") && user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    const profile = data as { role: UserRole; status: string } | null;
    const allowed = !!profile && profile.status === "active" &&
      STAFF_ROLES.includes(profile.role);
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = profile?.role === "member" ? "/portal" : "/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Skip /_next, favicon, static asset extensions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|ico|css|js|woff2?|ttf|webp|avif)$).*)"],
};
