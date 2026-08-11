// Internal/bookkeeping keys that already have dedicated UI elsewhere
// (stage has its own badge, source is import bookkeeping) — hidden from
// the generic "Details" list so it only shows meaningful business data.
const HIDDEN_KEYS = new Set(["stage", "source"]);

export function formatAttributeLabel(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function visibleAttributes(attributes: unknown): [string, unknown][] {
  if (!attributes || typeof attributes !== "object") return [];
  return Object.entries(attributes as Record<string, unknown>).filter(
    ([key, value]) =>
      !HIDDEN_KEYS.has(key) && value !== null && value !== undefined && value !== ""
  );
}
