import { redirect } from "next/navigation";
import { signOut, requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView, type PermissionMap } from "@/lib/permissions";
import Sidebar from "./sidebar";
import NoTenantEmptyState from "./no-tenant-empty-state";

// Overview has no module of its own — it's a summary of several, so
// everyone with a tenant sees it. Everything else is hidden entirely
// (not just disabled) when the signed-in role can't view that module —
// no point linking to a page that'll show nothing.
function navFor(permissions: PermissionMap) {
  const items = [
    { href: "/", label: "Overview", show: true },
    { href: "/contacts", label: "Leads", show: canView(permissions, "LEADS") },
    { href: "/workflows", label: "Workflows", show: canView(permissions, "WORKFLOWS") },
    { href: "/templates", label: "Templates", show: canView(permissions, "TEMPLATES") },
    { href: "/campaigns", label: "Campaigns", show: canView(permissions, "CAMPAIGNS") },
    { href: "/analytics", label: "Analytics", show: canView(permissions, "ANALYTICS") },
    {
      href: "/settings",
      label: "Settings",
      show: canView(permissions, "SETTINGS") || canView(permissions, "TEAM"),
    },
  ];
  return items.filter((i) => i.show).map(({ href, label }) => ({ href, label }));
}

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
        nav={navFor(account.permissions)}
        logoutAction={logout}
      />

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
