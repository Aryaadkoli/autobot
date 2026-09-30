"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatHour(h: number) {
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

export default function SendingLimits({
  canEdit,
  timezone,
  sendingLimitsEnabled,
  dailyCapPerContact,
  quietHoursStart,
  quietHoursEnd,
}: {
  canEdit: boolean;
  timezone: string;
  sendingLimitsEnabled: boolean;
  dailyCapPerContact: number;
  quietHoursStart: number;
  quietHoursEnd: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(sendingLimitsEnabled);
  const [cap, setCap] = useState(String(dailyCapPerContact));
  const [start, setStart] = useState(String(quietHoursStart));
  const [end, setEnd] = useState(String(quietHoursEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingSaving, setTogglingSaving] = useState(false);

  const hourOptions = Array.from({ length: 24 }, (_, h) => h);

  async function saveLimits(next: {
    sendingLimitsEnabled: boolean;
    dailyCapPerContact: number;
    quietHoursStart: number;
    quietHoursEnd: number;
  }) {
    const res = await fetch("/api/settings/limits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not save");
    router.refresh();
  }

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setTogglingSaving(true);
    setError(null);
    try {
      await saveLimits({
        sendingLimitsEnabled: next,
        dailyCapPerContact: Number(cap),
        quietHoursStart: Number(start),
        quietHoursEnd: Number(end),
      });
    } catch (err) {
      setEnabled(!next); // revert the optimistic flip
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setTogglingSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveLimits({
        sendingLimitsEnabled: enabled,
        dailyCapPerContact: Number(cap),
        quietHoursStart: Number(start),
        quietHoursEnd: Number(end),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-stone-700">Sending limits</h2>
          <p className="text-sm text-stone-500 mt-1">
            These apply automatically to every real send, both Campaigns and
            Scheduled Campaigns. Test messages always go to a fixed preview
            number and are not affected. Opt-outs are always honored
            regardless of this setting.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!canEdit || togglingSaving}
          role="switch"
          aria-checked={enabled}
          aria-label="Enable sending limits"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-default ${
            canEdit ? "cursor-pointer" : "cursor-default"
          } ${enabled ? "bg-stone-900" : "bg-stone-300"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!enabled && (
        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Sending limits are off — no daily cap or quiet hours are applied
          right now. The values below are kept and used again once you turn
          this back on.
        </p>
      )}

      {!editing ? (
        <div className={`mt-4 space-y-1.5 text-sm text-stone-700 ${enabled ? "" : "opacity-50"}`}>
          <p>
            Up to <span className="font-medium">{dailyCapPerContact}</span>{" "}
            message{dailyCapPerContact === 1 ? "" : "s"} per lead every 24h
          </p>
          <p>
            No sends between{" "}
            <span className="font-medium">{formatHour(quietHoursStart)}</span>{" "}
            and <span className="font-medium">{formatHour(quietHoursEnd)}</span>{" "}
            ({timezone})
          </p>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="mt-3 rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-stone-700 mb-1">
              Max messages per lead per day
            </label>
            <input
              type="number"
              min={1}
              max={50}
              required
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="w-full max-w-[140px] rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div>
              <label className="block text-sm text-stone-700 mb-1">
                Quiet hours start
              </label>
              <select
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-stone-700 mb-1">
                Quiet hours end
              </label>
              <select
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            Times are in {timezone}. Set both the same to disable quiet
            hours entirely.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setCap(String(dailyCapPerContact));
                setStart(String(quietHoursStart));
                setEnd(String(quietHoursEnd));
                setError(null);
              }}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
