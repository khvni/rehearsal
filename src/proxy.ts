import { NextResponse, type NextRequest } from "next/server";
import { hasAccess } from "@/lib/access";

/** Optional shared-secret gate: with REHEARSAL_ACCESS_TOKEN set, every page and API route needs it. */
export function proxy(req: NextRequest) {
  const token = process.env.REHEARSAL_ACCESS_TOKEN;
  if (!token || hasAccess(req.headers.get("authorization"), token)) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Rehearsal", charset="UTF-8"' },
  });
}

// Sentry webhooks carry their own HMAC signature; static build assets stay public.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/hooks/).*)"],
};
