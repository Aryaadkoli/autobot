import { signOut } from "@/auth";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import Sidebar from "./sidebar";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/contacts", label: "Leads" },
  { href: "/workflows", label: "Workflows" },
  { href: "/templates", label: "Templates" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.tenantId },
    select: { name: true },
  });

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="h-screen flex bg-stone-100 overflow-hidden">
      <Sidebar
        tenantName={tenant.name}
        userName={session.name}
        userEmail={session.email}
        userRole={session.role}
        nav={nav}
        logoutAction={logout}
      />

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
