// Turns a workflow's raw JSON outcome string ("no_response") into
// something readable ("No response") for wherever a finished
// SequenceInstance needs to show what happened — Analytics' workflow
// breakdown and the Lead detail page both need this, so it lives here
// once instead of twice.
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
