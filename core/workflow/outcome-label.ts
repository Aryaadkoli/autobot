// Turns a raw outcome string ("no_response") into a readable label ("No response") — shared by Analytics and the Lead detail page instead of duplicated.
export function outcomeLabelFromDefinition(
  definition: unknown,
  stepId: string | null
): string {
  if (!stepId) return "In progress";
  const steps = (definition as { steps?: Record<string, { outcome?: string }> })?.steps;
  const outcome = steps?.[stepId]?.outcome;
  if (!outcome) return stepId;
  const words = outcome.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : stepId;
}
