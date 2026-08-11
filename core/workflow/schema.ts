import { z } from "zod";

// Reuses TagRule's condition-tree shape (core/tagging/rules.ts) so branch
// steps and tag rules share one mental model instead of two.
const ConditionLeaf = z.object({
  attr: z.string().min(1),
  op: z.enum([
    "exists",
    "eq",
    "neq",
    "contains",
    "gt",
    "gte",
    "lt",
    "lte",
    "olderThanDays",
  ]),
  value: z.unknown().optional(),
});
type ConditionNodeType =
  | z.infer<typeof ConditionLeaf>
  | { all: ConditionNodeType[] }
  | { any: ConditionNodeType[] };
const ConditionNode: z.ZodType<ConditionNodeType> = z.lazy(() =>
  z.union([
    ConditionLeaf,
    z.object({ all: z.array(ConditionNode).min(1) }),
    z.object({ any: z.array(ConditionNode).min(1) }),
  ])
);

const EVENT_TYPES = [
  "IMPORTED",
  "UPDATED",
  "MSG_SENT",
  "MSG_DELIVERED",
  "MSG_READ",
  "MSG_FAILED",
  "LINK_CLICKED",
  "REPLIED",
  "PAYMENT_RECEIVED",
  "ORDER_PLACED",
  "OPTED_OUT",
  "CUSTOM",
] as const;

const ListenRule = z.object({
  event: z.enum(EVENT_TYPES),
  action: z.enum(["pivot", "goto"]),
  subflow: z.string().optional(), // required when action === "pivot"
  step: z.string().optional(), // required when action === "goto"
});

const SendStep = z.object({
  type: z.literal("send"),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  template: z.string().min(1), // MessageTemplate.name — not the id
  next: z.string().min(1),
});
export type SendStep = z.infer<typeof SendStep>;

// Duration format: a number plus s/m/h/d, e.g. "48h", "72h", "10m".
const DURATION_RE = /^\d+(s|m|h|d)$/;
const WaitStep = z.object({
  type: z.literal("wait"),
  duration: z.string().regex(DURATION_RE, 'Duration must look like "48h", "30m", "2d"'),
  listen: z.array(ListenRule).default([]),
  next: z.string().min(1),
});
export type WaitStep = z.infer<typeof WaitStep>;

const BranchStep = z.object({
  type: z.literal("branch"),
  if: ConditionNode,
  then: z.string().min(1),
  else: z.string().min(1),
});
export type BranchStep = z.infer<typeof BranchStep>;

const EndStep = z.object({
  type: z.literal("end"),
  outcome: z.string().min(1),
});
export type EndStep = z.infer<typeof EndStep>;

const Step = z.discriminatedUnion("type", [SendStep, WaitStep, BranchStep, EndStep]);
export type Step = z.infer<typeof Step>;

export const WorkflowDefinitionSchema = z.object({
  entry: z.string().min(1),
  steps: z.record(z.string(), Step).refine((s) => Object.keys(s).length > 0, {
    message: "Workflow must have at least one step",
  }),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// Beyond shape validation: every step reference (entry, next, then/else,
// listen[].step) must point at a step that actually exists, or the engine
// would throw mid-run for a lead days after enrollment — catch it at
// save time instead.
export function validateWorkflowDefinition(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const stepIds = new Set(Object.keys(def.steps));

  if (!stepIds.has(def.entry)) {
    errors.push(`Entry step "${def.entry}" is not defined in steps`);
  }

  for (const [id, step] of Object.entries(def.steps)) {
    const check = (ref: string | undefined, label: string) => {
      if (ref && !stepIds.has(ref)) {
        errors.push(`Step "${id}": ${label} "${ref}" is not defined`);
      }
    };
    if (step.type === "send") check(step.next, "next");
    if (step.type === "wait") {
      check(step.next, "next");
      for (const rule of step.listen) {
        if (rule.action === "goto") check(rule.step, "listen.step");
        if (rule.action === "pivot" && !rule.subflow) {
          errors.push(`Step "${id}": pivot listen rule needs a "subflow" name`);
        }
      }
    }
    if (step.type === "branch") {
      check(step.then, "then");
      check(step.else, "else");
    }
  }

  return errors;
}

export function parseDurationMs(duration: string): number {
  const match = DURATION_RE.exec(duration.trim());
  if (!match) throw new Error(`Invalid duration: "${duration}"`);
  const n = Number(duration.slice(0, -1));
  const unit = match[1];
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * multiplier;
}
