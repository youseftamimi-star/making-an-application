import { NextResponse, type NextRequest } from "next/server";

// Fast redirect to /login when there is no session cookie. Real checks happen in every API route.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("pinkas_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!login|setup|api|_next|icons|manifest.webmanifest|sw.js|favicon.ico).*)"],
};
