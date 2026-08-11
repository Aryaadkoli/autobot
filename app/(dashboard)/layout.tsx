import { redirect } from "next/navigation";
import { signOut, requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";
import Sidebar from "./sidebar";
import NoTenantEmptyState from "./no-tenant-empty-state";

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
  const account = await requireAccountSession();

  // No tenant selected yet — either there's nothing to select (render the
  // empty state right here, no sidebar makes sense without a tenant) or
  // there's a real choice to make (send them to pick one).
  if (!account.tenantId) {
    if (account.memberships.length === 0) {
      return <NoTenantEmptyState name={account.name} email={account.email} />;
    }
    redirect("/select-tenant");
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: account.tenantId },
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
        userName={account.name}
        userEmail={account.email}
        userRole={account.role ?? ""}
        canSwitchTenant={account.memberships.length > 1}
        nav={nav}
        logoutAction={logout}
      />

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
