// Converts between the plain-language step list a non-technical owner
// edits (SimpleStep[] + Ending[]) and the JSON WorkflowDefinition the
// engine actually runs (core/workflow/schema.ts) — so nobody has to write
// JSON by hand for the common case: a chain of "send this, wait, maybe
// react to a reply/click" steps, possibly finishing with more than one
// distinct outcome (e.g. "Replied" vs "No response"), optionally skipping
// ahead based on the lead's stage.
//
// What this CAN represent: any number of send/wait/branch steps chained
// forward, any number of named endings, reply/click reactions that either
// do nothing, jump to a later step, end with a specific outcome, or pivot
// to a different workflow — everything the mango-farmer / mango + reply
// example needs.
//
// What it can't (falls back to raw JSON, tryParseSimpleWorkflow returns
// null): backward jumps or loops, branch conditions on anything other
// than lead stage, wait durations finer than minutes, more than one
// reaction per event on the same wait step, or a workflow definition that
// doesn't reduce to one straight-line chain (e.g. two branch steps
// merging back together).

export type Ending = { id: string; label: string };

export type Reaction =
  | { kind: "none" }
  | { kind: "end"; endingId: string }
  | { kind: "skip"; targetIndex: number }
  | { kind: "workflow"; workflowName: string }; // pivot to a different workflow

export type BranchTarget = { kind: "end"; endingId: string } | { kind: "skip"; targetIndex: number };

export type SimpleStep =
  | { kind: "send"; channel: "WHATSAPP" | "EMAIL"; templateName: string }
  | {
      kind: "wait";
      amount: number;
      unit: "m" | "h" | "d";
      onReply: Reaction;
      onClick: Reaction;
    }
  | { kind: "branch"; stageEquals: string; then: BranchTarget };

function stepId(i: number) {
  return `step_${i + 1}`;
}

function slugify(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "outcome";
}

function humanizeOutcome(outcome: string): string {
  const words = outcome.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Completed";
}

export function newEndingId(): string {
  return `ending_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function buildDefinitionFromSteps(
  steps: SimpleStep[],
  endings: Ending[]
): { entry: string; steps: Record<string, unknown> } {
  const jsonSteps: Record<string, unknown> = {};
  for (const ending of endings) {
    jsonSteps[ending.id] = { type: "end", outcome: slugify(ending.label) };
  }
  const defaultEndingId = endings[0]?.id ?? "done";

  function reactionToListenEntry(
    event: "REPLIED" | "LINK_CLICKED",
    reaction: Reaction
  ): Record<string, unknown> | null {
    if (reaction.kind === "none") return null;
    if (reaction.kind === "end") return { event, action: "goto", step: reaction.endingId };
    if (reaction.kind === "skip") return { event, action: "goto", step: stepId(reaction.targetIndex) };
    return { event, action: "pivot", subflow: reaction.workflowName };
  }

  steps.forEach((step, i) => {
    const nextId = i + 1 < steps.length ? stepId(i + 1) : defaultEndingId;

    if (step.kind === "send") {
      jsonSteps[stepId(i)] = {
        type: "send",
        channel: step.channel,
        template: step.templateName,
        next: nextId,
      };
      return;
    }

    if (step.kind === "wait") {
      const listen = [
        reactionToListenEntry("REPLIED", step.onReply),
        reactionToListenEntry("LINK_CLICKED", step.onClick),
      ].filter((r): r is Record<string, unknown> => r !== null);
      jsonSteps[stepId(i)] = {
        type: "wait",
        duration: `${step.amount}${step.unit}`,
        listen,
        next: nextId,
      };
      return;
    }

    // branch
    const then = step.then.kind === "end" ? step.then.endingId : stepId(step.then.targetIndex);
    jsonSteps[stepId(i)] = {
      type: "branch",
      if: { attr: "stage", op: "eq", value: step.stageEquals },
      then,
      else: nextId,
    };
  });

  return { entry: steps.length > 0 ? stepId(0) : defaultEndingId, steps: jsonSteps };
}

type RawStep = {
  type: string;
  channel?: string;
  template?: string;
  next?: string;
  duration?: string;
  listen?: { event: string; action: string; step?: string; subflow?: string }[];
  if?: { attr?: string; op?: string; value?: unknown };
  then?: string;
  else?: string;
  outcome?: string;
};

const DURATION_RE = /^(\d+)(m|h|d)$/;

export type SimpleWorkflow = { steps: SimpleStep[]; endings: Ending[] };

// Returns null the moment anything doesn't fit the guided model — never
// throws, always safe to call speculatively.
export function tryParseSimpleWorkflow(definition: {
  entry: string;
  steps: Record<string, unknown>;
}): SimpleWorkflow | null {
  const rawSteps = definition.steps as Record<string, RawStep>;

  const allEndIds = Object.keys(rawSteps).filter((id) => rawSteps[id]?.type === "end");
  if (allEndIds.length === 0) return null;

  // Walk the main chain from entry via next/else until an "end" step —
  // that becomes the default/primary ending (what a step reaches by
  // simply falling through with no special reaction).
  const chain: string[] = [];
  const visited = new Set<string>();
  let cursor = definition.entry;
  let mainEndId: string | null = null;

  for (let guard = 0; guard < 50; guard++) {
    if (visited.has(cursor)) return null; // cycle — not representable
    visited.add(cursor);
    const step = rawSteps[cursor];
    if (!step) return null;

    if (step.type === "end") {
      mainEndId = cursor;
      break;
    }
    chain.push(cursor);
    if (step.type === "send" || step.type === "wait") {
      if (!step.next) return null;
      cursor = step.next;
    } else if (step.type === "branch") {
      if (!step.else) return null;
      cursor = step.else;
    } else {
      return null;
    }
  }
  if (!mainEndId) return null;

  const endingIds = [mainEndId, ...allEndIds.filter((id) => id !== mainEndId)];
  const endings: Ending[] = endingIds.map((id) => ({
    id,
    label: humanizeOutcome(rawSteps[id].outcome ?? id),
  }));
  const endingIdSet = new Set(endingIds);
  const positionOf = new Map(chain.map((id, i) => [id, i]));

  function resolveTarget(
    fromIndex: number,
    target: string | undefined
  ): { kind: "end"; endingId: string } | { kind: "skip"; targetIndex: number } | null {
    if (!target) return null;
    if (endingIdSet.has(target)) return { kind: "end", endingId: target };
    const idx = positionOf.get(target);
    if (idx === undefined || idx <= fromIndex) return null; // unknown or backward — unsupported
    return { kind: "skip", targetIndex: idx };
  }

  const steps: SimpleStep[] = [];

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    const step = rawSteps[id];
    const expectedNext = i + 1 < chain.length ? chain[i + 1] : mainEndId;

    if (step.type === "send") {
      if (step.next !== expectedNext) return null;
      if (!step.template) return null;
      if (step.channel !== "WHATSAPP" && step.channel !== "EMAIL") return null;
      steps.push({ kind: "send", channel: step.channel, templateName: step.template });
      continue;
    }

    if (step.type === "wait") {
      if (step.next !== expectedNext) return null;
      const match = step.duration ? DURATION_RE.exec(step.duration) : null;
      if (!match) return null; // seconds, or malformed — not representable here

      let onReply: Reaction = { kind: "none" };
      let onClick: Reaction = { kind: "none" };
      for (const rule of step.listen ?? []) {
        if (rule.event !== "REPLIED" && rule.event !== "LINK_CLICKED") return null;
        const isReply = rule.event === "REPLIED";
        if ((isReply && onReply.kind !== "none") || (!isReply && onClick.kind !== "none")) return null; // dup rule

        let reaction: Reaction;
        if (rule.action === "goto") {
          const target = resolveTarget(i, rule.step);
          if (!target) return null;
          reaction = target.kind === "end" ? { kind: "end", endingId: target.endingId } : { kind: "skip", targetIndex: target.targetIndex };
        } else if (rule.action === "pivot") {
          if (!rule.subflow) return null;
          reaction = { kind: "workflow", workflowName: rule.subflow };
        } else {
          return null;
        }
        if (isReply) onReply = reaction;
        else onClick = reaction;
      }

      steps.push({
        kind: "wait",
        amount: Number(match[1]),
        unit: match[2] as "m" | "h" | "d",
        onReply,
        onClick,
      });
      continue;
    }

    if (step.type === "branch") {
      if (step.else !== expectedNext) return null;
      if (!step.if || step.if.attr !== "stage" || step.if.op !== "eq") return null;
      const target = resolveTarget(i, step.then);
      if (!target) return null;
      steps.push({ kind: "branch", stageEquals: String(step.if.value ?? ""), then: target });
      continue;
    }

    return null;
  }

  return { steps, endings };
}
