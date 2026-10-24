import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = [
  "/overview",
  "/users",
  "/transactions",
  "/businesses",
  "/communities",
  "/organizer-settlements",
  "/kyc",
  "/providers",
  "/fees",
  "/limits",
  "/compliance",
  "/reconciliation",
  "/reports",
  "/audit-logs",
  "/settings",
  "/ajo-groups",
  "/draw-audits",
  "/payout-approvals",
  "/disputes",
  "/growth",
  "/campaigns",
  "/referrals",
  "/content",
  "/feature-flags",
  "/roles",
  "/system-health",
  "/change-password",
];

const PUBLIC = ["/login", "/mfa"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Marker cookie only - the real credentials are HttpOnly and never read here.
  const token = req.cookies.get("vista_admin_session")?.value;

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // if unauthenticated and trying to access protected → redirect to /login
  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // if authenticated and trying to access login/mfa → redirect to overview
  if (isPublic && token && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/overview";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|_static|favicon.ico|api).*)"],
};
