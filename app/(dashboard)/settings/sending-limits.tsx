"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatHour(h: number) {
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

export default function SendingLimits({
  isOwner,
  timezone,
  dailyCapPerContact,
  quietHoursStart,
  quietHoursEnd,
}: {
  isOwner: boolean;
  timezone: string;
  dailyCapPerContact: number;
  quietHoursStart: number;
  quietHoursEnd: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState(String(dailyCapPerContact));
  const [start, setStart] = useState(String(quietHoursStart));
  const [end, setEnd] = useState(String(quietHoursEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hourOptions = Array.from({ length: 24 }, (_, h) => h);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyCapPerContact: Number(cap),
          quietHoursStart: Number(start),
          quietHoursEnd: Number(end),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
      <h2 className="text-sm font-medium text-stone-700">Sending limits</h2>
      <p className="text-sm text-stone-500 mt-1">
        Applied to every send automatically — Campaigns, Scheduled
        Campaigns and test sends all respect these.
      </p>

      {!editing ? (
        <div className="mt-4 space-y-1.5 text-sm text-stone-700">
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
          {isOwner && (
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
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
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
