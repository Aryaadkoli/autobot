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
    // Always shown — the team hierarchy is visible to everyone now, so
    // there's always something worth seeing there even without SETTINGS/
    // TEAM permission.
    { href: "/settings", label: "Settings", show: true },
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
  const [tenant, accountDetails] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: account.tenantId },
      select: { name: true },
    }),
    // Phone/createdAt aren't cached in the JWT (unlike name/email/role) —
    // fetched fresh here so an edit in the Account modal shows up on the
    // very next render, no re-login needed.
    prisma.account.findUnique({
      where: { id: account.accountId },
      select: { phone: true, createdAt: true },
    }),
  ]);

  if (!tenant) {
    redirect("/api/auth/clear-stale-session");
  }

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="h-screen flex bg-stone-100/70 dark:bg-stone-950/60 overflow-hidden">
      <Sidebar
        tenantName={tenant.name}
        userName={account.name}
        userEmail={account.email}
        userPhone={accountDetails?.phone ?? null}
        memberSince={accountDetails?.createdAt.toISOString() ?? null}
        userRole={account.role ?? ""}
        memberships={account.memberships.map((m) => ({ tenantName: m.tenantName, role: m.role }))}
        canSwitchTenant={account.memberships.length > 1}
        nav={navFor(account.permissions)}
        logoutAction={logout}
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-16 sm:p-6 sm:pt-16 lg:p-8">
        {children}
      </main>
    </div>
  );
}
