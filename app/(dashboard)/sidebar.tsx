"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountModal from "./account-modal";

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
  const [showAccount, setShowAccount] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-60"
      } shrink-0 bg-stone-900 text-stone-300 flex flex-col transition-all duration-200`}
    >
      <div className="px-3 py-5 border-b border-stone-800 flex items-center justify-between">
        {!collapsed && (
          <div className="px-2 min-w-0">
            <div className="text-white font-semibold truncate">Autobot</div>
            <div className="text-xs text-amber-400 mt-0.5 truncate">
              {tenantName}
            </div>
            {canSwitchTenant && (
              <Link
                href="/select-tenant"
                className="text-[10px] text-stone-500 hover:text-stone-300 hover:underline"
              >
                Switch business
              </Link>
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-800 hover:text-white cursor-pointer"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          if (item.soon) {
            return collapsed ? (
              <div
                key={item.href}
                title={`${item.label} (soon)`}
                className="flex items-center justify-center h-9 rounded-lg text-stone-600 text-xs font-medium cursor-default"
              >
                {item.label[0]}
              </div>
            ) : (
              <span
                key={item.href}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-stone-600 cursor-default"
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
              title={item.preview ? `${item.label} (preview)` : item.label}
              className={`flex items-center justify-center h-9 rounded-lg text-xs font-medium hover:bg-stone-800 hover:text-white ${
                active ? "bg-stone-800 text-white" : ""
              }`}
            >
              {item.label[0]}
            </Link>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-stone-800 hover:text-white ${
                active ? "bg-stone-800 text-white" : ""
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

      <div className="border-t border-stone-800 p-3 space-y-2">
        {collapsed ? (
          <button
            onClick={() => setShowAccount(true)}
            title={`${userName}${userEmail ? " · " + userEmail : ""}`}
            className="w-full flex items-center justify-center h-9 rounded-lg bg-stone-800/60 text-xs font-medium text-white cursor-pointer hover:bg-stone-800"
          >
            {userName ? userName[0].toUpperCase() : "?"}
          </button>
        ) : (
          <button
            onClick={() => setShowAccount(true)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-stone-800/60 cursor-pointer hover:bg-stone-800"
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
              className="w-full flex items-center justify-center h-9 rounded-lg text-sm cursor-pointer hover:bg-stone-800 hover:text-white"
            >
              ⏻
            </button>
          ) : (
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-stone-800 hover:text-white"
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
  );
}
