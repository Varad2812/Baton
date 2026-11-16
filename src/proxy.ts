// Runs before every page and API request (Next 16 "proxy", Node runtime).
// 1. Gives each browser a signed anonymous visitor cookie and forwards the verified id upstream.
// 2. Sends the shared demo URL (/p/festflow/...) to the visitor's private copy, so judges never
//    see each other's changes. API calls on /api/projects/festflow/... are rewritten the same way.
import { NextResponse, type NextRequest } from "next/server";
import {
  newVisitorId,
  sandboxSlug,
  signVisitor,
  verifyVisitor,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE,
  VISITOR_HEADER,
} from "@/lib/visitor";

const DEMO_PATH = /^\/(p|api\/projects)\/festflow(\/.*)?$/;

export function proxy(req: NextRequest) {
  let vid = verifyVisitor(req.cookies.get(VISITOR_COOKIE)?.value);
  const fresh = !vid;
  if (!vid) vid = newVisitorId();

  const headers = new Headers(req.headers);
  headers.set(VISITOR_HEADER, vid);

  let res: NextResponse;
  const m = req.nextUrl.pathname.match(DEMO_PATH);
  if (m) {
    const url = req.nextUrl.clone();
    url.pathname = `/${m[1]}/${sandboxSlug(vid)}${m[2] ?? ""}`;
    res = m[1] === "p" && (req.method === "GET" || req.method === "HEAD")
      ? NextResponse.redirect(url, 307)
      : NextResponse.rewrite(url, { request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }
  if (fresh) {
    res.cookies.set(VISITOR_COOKIE, signVisitor(vid), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|samples/|.*\\.[a-zA-Z0-9]{2,5}$).*)"],
};
