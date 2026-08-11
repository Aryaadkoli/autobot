// Non-negotiable rule #7 (CLAUDE.md): timezone-aware sends, respect tenant
// quiet hours. Tenant.quietHoursStart/End have existed since the initial
// schema but were never enforced anywhere — this closes that gap without
// needing the Phase 4 worker (no queue/defer, just skip like the daily cap).
export function currentHourInTimezone(timezone: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    // Intl can return "24" for midnight with hour12:false — normalize to 0.
    return hourPart ? Number(hourPart.value) % 24 : now.getHours();
  } catch {
    // Unknown/invalid timezone string — fail open to server-local hour
    // rather than blocking every send.
    return now.getHours();
  }
}

export function isWithinQuietHours(
  hour: number,
  quietHoursStart: number,
  quietHoursEnd: number
): boolean {
  if (quietHoursStart === quietHoursEnd) return false; // no window configured
  if (quietHoursStart < quietHoursEnd) {
    // Same-day window, e.g. 1am–5am.
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  // Wraps midnight, e.g. 21:00–09:00 (the default).
  return hour >= quietHoursStart || hour < quietHoursEnd;
}
