import { redirect } from "next/navigation";
import { signOut, requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView, type PermissionMap } from "@/lib/permissions";
import Sidebar from "./sidebar";
import NoTenantEmptyState from "./no-tenant-empty-state";

// Overview has no module of its own (a summary of several) so it's always shown; other links are hidden, not disabled, when unviewable.
function navFor(permissions: PermissionMap) {
  const items = [
    { href: "/", label: "Overview", show: true },
    { href: "/contacts", label: "Leads", show: canView(permissions, "LEADS") },
    { href: "/templates", label: "Templates", show: canView(permissions, "TEMPLATES") },
    { href: "/workflows", label: "Workflows", show: canView(permissions, "WORKFLOWS") },
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

  if (!account.tenantId) {
    if (account.memberships.length === 0) {
      return <NoTenantEmptyState name={account.name} email={account.email} />;
    }
    redirect("/select-tenant");
  }

  // findUnique, not findUniqueOrThrow: a signed-in browser's session cookie
  // caches this tenantId, so a dev database reset (or any tenant deletion)
  // leaves a stale, no-longer-existent id sitting in someone's cookie —
  // that must never crash the whole layout. Route through a Route Handler
  // to clear it (see clear-stale-session/route.ts) — signOut() itself can
  // only run in a Server Action or Route Handler, never during a Server
  // Component's render, so it can't be called directly here.
  const tenant = await prisma.tenant.findUnique({
    where: { id: account.tenantId },
    select: { name: true },
  });

  if (!tenant) {
    redirect("/api/auth/clear-stale-session");
  }

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
