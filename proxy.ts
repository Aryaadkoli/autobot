import { auth } from "@/auth";

// Protects every page except /login, /signup, and static assets.
// Not logged in -> redirected to /login. (/select-tenant and the
// no-tenant empty state both still require a real session — they're
// reached only via the dashboard layout's gate, not exempted here.)
const PUBLIC_PATHS = new Set(["/login", "/signup"]);

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.has(req.nextUrl.pathname);
  if (!req.auth && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (req.auth && req.nextUrl.pathname === "/login") {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
