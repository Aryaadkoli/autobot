// Small shared helper for the "N hours/days ago" cutoffs used all over
// (daily-cap windows, trend queries, quiet-hours-adjacent checks) —
// factored out partly for reuse, partly so Date.now() isn't called
// directly inside Server Component bodies (the purity lint rule flags
// that as an impure call during render).
export function hoursAgo(hours: number, from = new Date()): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}
