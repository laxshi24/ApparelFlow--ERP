import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: visitors without a session cookie are sent to /login.
 * This is NOT the security boundary — every page guard and API handler validates
 * the session against the database and checks permissions itself.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("af_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
