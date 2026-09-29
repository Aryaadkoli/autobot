"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountModal from "./account-modal";
import ThemeSwitch from "@/components/theme-switch";

type NavItem = { href: string; label: string; soon?: boolean; preview?: boolean };

export default function Sidebar({
  tenantName,
  userName,
  userEmail,
  userRole,
  canSwitchTenant,
  nav,
  logoutAction,
}: {
  tenantName: string;
  userName: string;
  userEmail: string;
  userRole: string;
  canSwitchTenant?: boolean;
  nav: NavItem[];
  logoutAction: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Hamburger trigger — only ever shown below lg, where the sidebar
          becomes an off-canvas drawer instead of a static column. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl lg:hidden
        bg-white/60 backdrop-blur-xl border border-stone-200/60 text-stone-700 shadow-md
        dark:bg-stone-900/70 dark:border-white/10 dark:text-stone-200"
      >
        ☰
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`${collapsed ? "lg:w-16" : "lg:w-60"} w-60 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 lg:static lg:translate-x-0
      relative shrink-0 flex flex-col transition-all duration-200 overflow-hidden
      bg-stone-900/80 backdrop-blur-2xl text-stone-300 border-r border-white/10 shadow-[8px_0_30px_-15px_rgba(0,0,0,0.5)]`}
      >
      {/* Decorative blurred glow blobs behind the glass — purely visual, no interaction */}
      <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -right-16 h-56 w-56 rounded-full bg-stone-500/10 blur-3xl" />

      <div className="relative px-3 py-5 border-b border-white/10 flex items-center justify-between">
        {!collapsed && (
          <div className="px-2 min-w-0">
            <div className="text-white font-semibold truncate">Autobot</div>
            <div className="text-xs text-amber-400 mt-0.5 truncate">
              {tenantName}
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex shrink-0 h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
        >
          {collapsed ? "»" : "«"}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="lg:hidden shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
        >
          ×
        </button>
      </div>

      <nav className="relative flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href;
          if (item.soon) {
            return collapsed ? (
              <div
                key={item.href}
                title={`${item.label} (soon)`}
                className="flex items-center justify-center h-9 rounded-xl text-stone-600 text-xs font-medium cursor-default"
              >
                {item.label[0]}
              </div>
            ) : (
              <span
                key={item.href}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-stone-600 cursor-default"
              >
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">
                  soon
                </span>
              </span>
            );
          }
          return collapsed ? (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={item.preview ? `${item.label} (preview)` : item.label}
              className={`flex items-center justify-center h-9 rounded-xl text-xs font-medium transition-all ${
                active
                  ? "bg-white/10 backdrop-blur-sm border border-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "border border-transparent hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label[0]}
            </Link>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                active
                  ? "bg-white/10 backdrop-blur-sm border border-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "border border-transparent hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
              {item.preview && (
                <span className="text-[10px] uppercase tracking-wide text-stone-500">
                  preview
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="relative border-t border-white/10 p-3 space-y-2">
        {canSwitchTenant &&
          (collapsed ? (
            <Link
              href="/select-tenant"
              onClick={() => setMobileOpen(false)}
              title="Switch organization"
              className="w-full flex items-center justify-center h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors"
            >
              ⇄
            </Link>
          ) : (
            <Link
              href="/select-tenant"
              onClick={() => setMobileOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors"
            >
              <span>⇄</span>
              <span>Switch organization</span>
            </Link>
          ))}

        <ThemeSwitch collapsed={collapsed} />

        {collapsed ? (
          <button
            onClick={() => setShowAccount(true)}
            title={`${userName}${userEmail ? " · " + userEmail : ""}`}
            className="w-full flex items-center justify-center h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-xs font-medium text-white cursor-pointer hover:bg-white/10 transition-colors"
          >
            {userName ? userName[0].toUpperCase() : "?"}
          </button>
        ) : (
          <button
            onClick={() => setShowAccount(true)}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
          >
            <div className="text-sm text-white font-medium truncate">
              {userName || "Account"}
            </div>
            {userEmail && (
              <div className="text-xs text-stone-500 truncate mt-0.5">
                {userEmail}
              </div>
            )}
            {userRole && (
              <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide text-amber-400">
                {userRole}
              </span>
            )}
          </button>
        )}

        <form action={logoutAction}>
          {collapsed ? (
            <button
              type="submit"
              title="Sign out"
              className="w-full flex items-center justify-center h-9 rounded-xl text-sm cursor-pointer border border-transparent hover:bg-white/5 hover:text-white transition-colors"
            >
              ⏻
            </button>
          ) : (
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-xl text-sm cursor-pointer border border-transparent hover:bg-white/5 hover:text-white transition-colors"
            >
              Sign out
            </button>
          )}
        </form>
      </div>

      {showAccount && (
        <AccountModal
          tenantName={tenantName}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          onClose={() => setShowAccount(false)}
        />
      )}
      </aside>
    </>
  );
}
