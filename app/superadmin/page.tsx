import { notFound, redirect } from "next/navigation";
import { requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";

// Platform-level view across every tenant — deliberately the one place in
// the app that doesn't filter by a single tenantId. Gated to one exact
// email, not a role or permission (there's no "superadmin" role — this
// sits above the whole per-tenant permission system entirely). No link to
// this page exists anywhere in the UI; returning notFound() for anyone
// else means a stray visit doesn't even reveal that the page exists.
const SUPERADMIN_EMAIL = "aryaadkoli@gmail.com";

export default async function SuperadminPage() {
  let account;
  try {
    account = await requireAccountSession();
  } catch {
    redirect("/login");
  }

  if (account.email !== SUPERADMIN_EMAIL) {
    notFound();
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      createdAt: true,
      users: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          role: { select: { name: true } },
          account: { select: { name: true, email: true } },
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-stone-100 px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-stone-900">
          All organizations
        </h1>
        <p className="text-sm text-stone-500 mt-1 mb-8">
          {tenants.length} organization{tenants.length === 1 ? "" : "s"} across the whole platform. Only visible to {SUPERADMIN_EMAIL}.
        </p>

        <div className="space-y-6">
          {tenants.map((tenant) => (
            <div
              key={tenant.id}
              className="bg-white rounded-2xl border border-stone-200 p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-stone-900">{tenant.name}</h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {tenant.slug} · {tenant.plan} · created{" "}
                    {tenant.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="text-xs text-stone-500 shrink-0">
                  {tenant.users.length} member{tenant.users.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
                {tenant.users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="text-stone-900">{u.account.name}</span>{" "}
                      <span className="text-stone-500">{u.account.email}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      {u.role.name}
                    </span>
                  </div>
                ))}
                {tenant.users.length === 0 && (
                  <p className="py-2 text-sm text-stone-400">No members.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
