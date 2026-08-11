"use client";

import { useState } from "react";

type TrendPoint = { date: string; count: number };
type CampaignRow = {
  id: string;
  templateName: string;
  source: string;
  targetedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
};
type TemplateRow = { name: string; sent: number; delivered: number; failed: number };
type WorkflowOutcomeRow = {
  id: string;
  name: string;
  total: number;
  active: number;
  otherEnded: number;
  outcomes: { label: string; count: number }[];
};

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default function AnalyticsClient({
  totalAttempts,
  sent,
  confirmedDelivered,
  read,
  failed,
  suppressed,
  totalCostPaise,
  isLiveConnected,
  trend,
  campaigns,
  topTemplates,
  workflowOutcomes,
}: {
  totalAttempts: number;
  sent: number;
  confirmedDelivered: number;
  read: number;
  failed: number;
  suppressed: number;
  totalCostPaise: number;
  isLiveConnected: boolean;
  trend: TrendPoint[];
  campaigns: CampaignRow[];
  topTemplates: TemplateRow[];
  workflowOutcomes: WorkflowOutcomeRow[];
}) {
  const [hoverDay, setHoverDay] = useState<TrendPoint | null>(null);
  const maxCount = Math.max(1, ...trend.map((t) => t.count));

  const cards = [
    {
      label: "Messages sent",
      value: totalAttempts,
      sub: "all-time",
      color: "text-stone-900",
    },
    {
      label: "Delivered",
      value: pct(confirmedDelivered, sent + confirmedDelivered || 1),
      sub: isLiveConnected
        ? "confirmed by WhatsApp"
        : "connect WhatsApp to see real rates",
      color: "text-green-700",
    },
    {
      label: "Read",
      value: pct(read, sent + confirmedDelivered || 1),
      sub: isLiveConnected ? "opened by the lead" : "needs a live connection",
      color: "text-amber-700",
    },
    {
      label: "Failed",
      value: failed,
      sub: suppressed > 0 ? `+${suppressed} blocked by safety rules` : "delivery errors",
      color: "text-red-700",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-2xl border border-stone-200 p-4"
          >
            <p className="text-xs text-stone-500">{c.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-stone-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-stone-700">
            Messages sent — last 14 days
          </h2>
          <p className="text-xs text-stone-500">
            {hoverDay
              ? `${new Date(hoverDay.date).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}: ${hoverDay.count} sent`
              : "Estimated spend so far: ₹" + (totalCostPaise / 100).toFixed(2)}
          </p>
        </div>
        <div className="flex items-end gap-1.5 h-28">
          {trend.map((t) => (
            <div
              key={t.date}
              className="flex-1 flex flex-col items-center justify-end h-full group"
              onMouseEnter={() => setHoverDay(t)}
              onMouseLeave={() => setHoverDay(null)}
            >
              <div
                className={`w-full rounded-t transition-colors cursor-pointer ${
                  hoverDay?.date === t.date
                    ? "bg-amber-500"
                    : "bg-amber-200 group-hover:bg-amber-300"
                }`}
                style={{
                  height: `${Math.max(4, (t.count / maxCount) * 100)}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-stone-400">
          <span>
            {new Date(trend[0]?.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </span>
          <span>Today</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div>
          <h2 className="text-sm font-medium text-stone-700 mb-3">
            Top templates by volume
          </h2>
          {topTemplates.length === 0 ? (
            <p className="text-sm text-stone-500">
              No sends yet — nothing to rank.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200">
                    <th className="px-4 py-2.5 font-medium">Template</th>
                    <th className="px-4 py-2.5 font-medium">Sent</th>
                    <th className="px-4 py-2.5 font-medium">Delivered</th>
                    <th className="px-4 py-2.5 font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {topTemplates.map((t) => (
                    <tr key={t.name} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-2.5 text-stone-900">{t.name}</td>
                      <td className="px-4 py-2.5 text-stone-600">{t.sent}</td>
                      <td className="px-4 py-2.5 text-green-700">{t.delivered}</td>
                      <td className="px-4 py-2.5 text-red-700">{t.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium text-stone-700 mb-3">
            Workflow outcomes
          </h2>
          {workflowOutcomes.length === 0 ? (
            <p className="text-sm text-stone-500">
              No leads have run through a workflow yet — enroll some from the
              Workflows page.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
              {workflowOutcomes.map((w) => (
                <div key={w.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-900">{w.name}</span>
                    <span className="text-xs text-stone-400">{w.total} total</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {w.active > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-200">
                        {w.active} in progress
                      </span>
                    )}
                    {w.outcomes.map((o) => (
                      <span
                        key={o.label}
                        className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs border border-stone-200"
                      >
                        {o.count} {o.label}
                      </span>
                    ))}
                    {w.otherEnded > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-xs border border-stone-200">
                        {w.otherEnded} stopped early
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="text-sm font-medium text-stone-700 mb-3">
        Recent campaign performance
      </h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-stone-500">
          No campaigns sent yet — send one from the Campaigns page to see
          results here.
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Targeted</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Success rate</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-600">
                    {new Date(c.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 text-stone-900">{c.templateName}</td>
                  <td className="px-4 py-3 text-stone-600">{c.source}</td>
                  <td className="px-4 py-3 text-stone-600">{c.targetedCount}</td>
                  <td className="px-4 py-3 text-green-700">{c.sentCount}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {pct(c.sentCount, c.targetedCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
