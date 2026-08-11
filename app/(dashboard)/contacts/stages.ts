// Lead stage lives in Contact.attributes.stage (see CLAUDE.md UI language section).
export const STAGES = [
  { value: "new", label: "New", classes: "bg-stone-100 text-stone-700 border-stone-200" },
  { value: "contacted", label: "Contacted", classes: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "interested", label: "Interested", classes: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "converted", label: "Converted", classes: "bg-green-50 text-green-700 border-green-200" },
  { value: "lost", label: "Lost", classes: "bg-red-50 text-red-700 border-red-200" },
] as const;

export type StageValue = (typeof STAGES)[number]["value"];

export function stageOf(attributes: unknown): StageValue {
  const stage = (attributes as { stage?: string } | null)?.stage;
  return STAGES.some((s) => s.value === stage) ? (stage as StageValue) : "new";
}

export function stageMeta(value: string) {
  return STAGES.find((s) => s.value === value) ?? STAGES[0];
}
