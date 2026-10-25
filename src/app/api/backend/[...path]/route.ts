import { NextRequest, NextResponse } from "next/server";

const upstreamBase = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:9100/api/v1"
).replace(/\/+$/, "");

const upstreamUrl = new URL(upstreamBase);
const upstreamPath = upstreamUrl.pathname.replace(/\/+$/, "");
const proxyPath = "/api/backend";

/**
 * Express includes an Expires date (and therefore a comma) in each cookie.
 * Split only on commas which begin the next cookie name.
 */
function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((cookie) => cookie.trim());
}

function getSetCookies(headers: Headers): string[] {
  const cookieHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof cookieHeaders.getSetCookie === "function") {
    return cookieHeaders.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? splitSetCookieHeader(combined) : [];
}

function scopeCookieToAdminHost(cookie: string): string {
  // Never let an upstream Domain attribute point the proxied cookie at a host
  // other than the admin application.
  let scoped = cookie.replace(/;\s*Domain=[^;]*/gi, "");

  // The refresh cookie is deliberately restricted to the auth endpoints. Its
  // upstream path must follow those endpoints through the local proxy.
  if (upstreamPath) {
    const escapedPath = upstreamPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    scoped = scoped.replace(
      new RegExp(`;\\s*Path=${escapedPath}(?=/|;|$)`, "i"),
      `; Path=${proxyPath}`,
    );
  }

  return scoped;
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = new URL(
    `${upstreamBase}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
  );

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("origin");
  headers.delete("referer");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("set-cookie");
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  for (const cookie of getSetCookies(upstreamResponse.headers)) {
    response.headers.append("set-cookie", scopeCookieToAdminHost(cookie));
  }

  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
