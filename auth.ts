import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// Central auth config. Everything security-related lives in this file.
// The session carries tenantId — every DB query in the app filters on it.

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = (creds?.email as string | undefined)?.toLowerCase().trim();
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findFirst({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      (session.user as any).id = token.id;
      (session.user as any).tenantId = token.tenantId;
      (session.user as any).role = token.role;
      return session;
    },
  },
});

// Helper used by every server component / API route that touches data.
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return {
    userId: (session.user as any).id as string,
    tenantId: (session.user as any).tenantId as string,
    role: (session.user as any).role as string,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}
