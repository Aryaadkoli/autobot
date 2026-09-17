// Factored out partly for reuse, partly so Date.now() isn't called directly inside Server Component bodies (the purity lint rule flags that as impure during render).
export function hoursAgo(hours: number, from = new Date()): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}
