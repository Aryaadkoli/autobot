import { auth } from "@/auth";

// Protects every page except /login and static assets.
// Not logged in -> redirected to /login.
export default auth((req) => {
  const isLogin = req.nextUrl.pathname === "/login";
  if (!req.auth && !isLogin) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (req.auth && isLogin) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
