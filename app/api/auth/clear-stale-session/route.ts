import { signOut } from "@/auth";

// A Route Handler, not a plain redirect target — signOut() clears the
// session cookie, which Next.js only allows inside a Server Action or
// Route Handler, never during a Server Component's render. This exists so
// app/(dashboard)/layout.tsx can redirect here when a session's tenantId no
// longer exists in the database (e.g. a dev database reset) instead of
// crashing with "Cookies can only be modified in a Server Action or Route
// Handler."
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
