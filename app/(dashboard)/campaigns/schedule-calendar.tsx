"use client";

import { useMemo, useState } from "react";

type ScheduledItem = {
  id: string;
  name: string;
  templateName: string;
  tagName: string | null;
  stage: string | null;
  scheduledFor: string;
  status: string;
  recurrence: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RECURRENCE_LABEL: Record<string, string> = {
  MONTHLY: "↻ monthly",
  YEARLY: "↻ yearly",
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// A glanceable month grid so planning multiple crops/products across
// different dates (the mango-farmers-in-Jan, smart-meters-in-Mar case) is
// something the owner can actually see at once, not just read row by row.
export default function ScheduleCalendar({
  scheduled,
  onCancel,
  cancellingId,
}: {
  scheduled: ScheduledItem[];
  onCancel: (id: string) => void;
  cancellingId: string | null;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const items = useMemo(
    () => scheduled.filter((s) => s.status === "PENDING"),
    [scheduled]
  );

  const cells = useMemo(() => {
    const firstOfMonth = viewMonth;
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0
    ).getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewMonth]);

  const today = new Date();
  const monthLabel = viewMonth.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  function itemsOn(day: Date) {
    return items.filter((s) => sameDay(new Date(s.scheduledFor), day));
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() =>
            setViewMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
            )
          }
          className="rounded-lg border border-stone-300 text-stone-600 text-sm w-8 h-8 hover:bg-stone-100 cursor-pointer"
        >
          ‹
        </button>
        <h3 className="text-sm font-medium text-stone-800">{monthLabel}</h3>
        <button
          type="button"
          onClick={() =>
            setViewMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
            )
          }
          className="rounded-lg border border-stone-300 text-stone-600 text-sm w-8 h-8 hover:bg-stone-100 cursor-pointer"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-400 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-20" />;
          const dayItems = itemsOn(day);
          const isToday = sameDay(day, today);
          return (
            <button
              type="button"
              key={i}
              onClick={() => dayItems.length > 0 && setSelectedDay(day)}
              className={`h-20 rounded-lg border p-1 text-left align-top flex flex-col overflow-hidden ${
                dayItems.length > 0
                  ? "border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer"
                  : "border-stone-100 cursor-default"
              }`}
            >
              <span
                className={`text-xs ${
                  isToday
                    ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-900 text-white"
                    : "text-stone-500"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayItems.slice(0, 2).map((s) => (
                  <div
                    key={s.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded bg-amber-200/70 text-amber-900 truncate"
                    title={s.name}
                  >
                    {s.name}
                  </div>
                ))}
                {dayItems.length > 2 && (
                  <div className="text-[10px] text-stone-500 px-1">
                    +{dayItems.length - 2} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white rounded-2xl border border-stone-200 p-5 max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-stone-800">
                {selectedDay.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h4>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer text-sm"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              {itemsOn(selectedDay).map((s) => (
                <div
                  key={s.id}
                  className="border border-stone-200 rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {s.name}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {s.templateName} ·{" "}
                        {s.tagName
                          ? `Tag: ${s.tagName}`
                          : s.stage
                            ? `Stage: ${s.stage}`
                            : "All leads"}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(s.scheduledFor).toLocaleTimeString("en-IN", {
                          timeStyle: "short",
                        })}
                        {RECURRENCE_LABEL[s.recurrence] && (
                          <span className="ml-1.5 text-amber-700">
                            {RECURRENCE_LABEL[s.recurrence]}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      disabled={cancellingId === s.id}
                      onClick={() => onCancel(s.id)}
                      className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {cancellingId === s.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
