"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AccountModal from "./account-modal";
import ThemeSwitch from "@/components/theme-switch";
import CreateOrgModal from "./settings/create-org-modal";

type NavItem = { href: string; label: string; soon?: boolean; preview?: boolean };

// One small line icon per section — the sidebar reads as a plain list of
// text without these, especially collapsed (where the fallback used to be
// just the first letter of the label).
const NAV_ICONS: Record<string, React.ReactNode> = {
  "/": (
    <path d="M3 11.5 12 4l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />
  ),
  "/contacts": (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M16 7.5c1.7.3 3 1.6 3 3.2M17 14c2.3.5 4 2.3 4 4.5" />
    </>
  ),
  "/templates": (
    <>
      <rect x="3" y="5" width="18" height="13" rx="2" />
      <path d="M7 9h10M7 13h6" />
    </>
  ),
  "/workflows": (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2V16M8 6h4a4 4 0 0 1 4 4v0" />
    </>
  ),
  "/campaigns": <path d="m3 11 18-8-8 18-2.5-7.5L3 11Z" />,
  "/analytics": (
    <>
      <path d="M4 20V10M11 20V4M18 20v-7" />
    </>
  ),
  "/settings": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
};

function NavIcon({ href }: { href: string }) {
  const path = NAV_ICONS[href];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {path}
    </svg>
  );
}

export default function Sidebar({
  tenantName,
  userName,
  userEmail,
  userPhone,
  memberSince,
  userRole,
  memberships,
  canSwitchTenant,
  nav,
  logoutAction,
}: {
  tenantName: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  memberSince: string | null;
  userRole: string;
  memberships: { tenantName: string; role: string }[];
  canSwitchTenant?: boolean;
  nav: NavItem[];
  logoutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
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
        className={`${collapsed ? "lg:w-16" : "lg:w-64"} w-64 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 lg:static lg:translate-x-0
      relative shrink-0 flex flex-col transition-all duration-200 overflow-hidden
      bg-stone-900/80 backdrop-blur-2xl text-stone-300 border-r border-white/10 shadow-[8px_0_30px_-15px_rgba(0,0,0,0.5)]`}
      >
      {/* Decorative blurred glow + a glossy top edge — depth without
          reaching for a tinted accent color. */}
      <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-stone-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -right-16 h-56 w-56 rounded-full bg-stone-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <div className="relative px-3 py-5 border-b border-white/10 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/15 to-white/5 border border-white/10 text-white font-heading font-semibold text-sm">
              A
            </div>
            <div className="min-w-0">
              <div className="text-white font-medium truncate leading-tight">Autobot</div>
              <div className="text-xs text-stone-400 truncate leading-tight mt-0.5">
                {tenantName}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex shrink-0 h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-stone-300 hover:bg-white/15 hover:text-white cursor-pointer transition-colors"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
          </svg>
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
                className="flex items-center justify-center h-9 rounded-xl text-stone-600 cursor-default"
              >
                <NavIcon href={item.href} />
              </div>
            ) : (
              <span
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-stone-600 cursor-default"
              >
                <NavIcon href={item.href} />
                <span className="flex-1">{item.label}</span>
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
              className={`relative flex items-center justify-center h-10 rounded-xl transition-all ${
                active
                  ? "bg-white/10 backdrop-blur-sm border border-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "border border-transparent text-stone-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-stone-200/70" />
              )}
              <NavIcon href={item.href} />
            </Link>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? "bg-white/10 backdrop-blur-sm border border-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "border border-transparent text-stone-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-stone-200/70" />
              )}
              <NavIcon href={item.href} />
              <span className="flex-1">{item.label}</span>
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
        {collapsed ? (
          <button
            onClick={() => setShowCreateOrg(true)}
            title="Create organization"
            className="w-full flex items-center justify-center h-9 rounded-xl bg-white/5 border border-white/10 text-stone-300 cursor-pointer hover:bg-white/10 transition-colors"
          >
            +
          </button>
        ) : (
          <button
            onClick={() => setShowCreateOrg(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-stone-300 cursor-pointer hover:bg-white/10 transition-colors"
          >
            <span>+</span>
            <span>Create organization</span>
          </button>
        )}

        {canSwitchTenant &&
          (collapsed ? (
            <Link
              href="/select-tenant"
              onClick={() => setMobileOpen(false)}
              title="Switch organization"
              className="w-full flex items-center justify-center h-9 rounded-xl bg-white/5 border border-white/10 text-stone-300 cursor-pointer hover:bg-white/10 transition-colors"
            >
              ⇄
            </Link>
          ) : (
            <Link
              href="/select-tenant"
              onClick={() => setMobileOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-stone-300 cursor-pointer hover:bg-white/10 transition-colors"
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
            className="w-full flex items-center justify-center h-9 rounded-xl bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-sm border border-white/10 text-xs font-medium text-white cursor-pointer hover:from-white/20 hover:to-white/10 transition-colors"
          >
            {userName ? userName[0].toUpperCase() : "?"}
          </button>
        ) : (
          <button
            onClick={() => setShowAccount(true)}
            className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/5 border border-white/10 text-white text-xs font-medium">
              {userName ? userName[0].toUpperCase() : "?"}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-white font-medium truncate leading-tight">
                {userName || "Account"}
              </div>
              {userEmail && (
                <div className="text-xs text-stone-500 truncate leading-tight mt-0.5">
                  {userEmail}
                </div>
              )}
            </div>
            {userRole && (
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-stone-400">
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

      </aside>

      {/* Rendered outside <aside>, not inside it: that element has
          backdrop-blur (a CSS filter), and a filter on an ancestor turns
          `position: fixed` descendants into something anchored to that
          ancestor's box instead of the viewport — which is why these
          modals were showing up pinned near the sidebar instead of
          centered on the whole screen. */}
      {showAccount && (
        <AccountModal
          tenantName={tenantName}
          userName={userName}
          userEmail={userEmail}
          userPhone={userPhone}
          memberSince={memberSince}
          memberships={memberships}
          userRole={userRole}
          onClose={() => setShowAccount(false)}
        />
      )}

      {showCreateOrg && (
        <CreateOrgModal
          onClose={() => setShowCreateOrg(false)}
          onSaved={() => {
            setShowCreateOrg(false);
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
