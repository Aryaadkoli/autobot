"use client";

import type { SimpleStep, Reaction, BranchTarget, Ending } from "./simple-builder";
import { STAGES } from "../contacts/stages";

const selectClass =
  "w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

export function describeStep(step: SimpleStep, index: number): string {
  const n = `Step ${index + 1}`;
  if (step.kind === "send") return `${n} — send "${step.templateName || "(no template)"}"`;
  if (step.kind === "wait") return `${n} — wait ${step.amount}${step.unit === "h" ? " hours" : step.unit === "d" ? " days" : " minutes"}`;
  return `${n} — check stage`;
}

function encodeReaction(r: Reaction): string {
  if (r.kind === "none") return "none";
  if (r.kind === "end") return `end:${r.endingId}`;
  if (r.kind === "skip") return `skip:${r.targetIndex}`;
  return `wf:${r.workflowName}`;
}

function decodeReaction(v: string): Reaction {
  if (v === "none") return { kind: "none" };
  if (v.startsWith("end:")) return { kind: "end", endingId: v.slice(4) };
  if (v.startsWith("skip:")) return { kind: "skip", targetIndex: Number(v.slice(5)) };
  return { kind: "workflow", workflowName: v.slice(3) };
}

// Shared by "if they reply" and "if they click a link" — both can end
// the sequence with a specific outcome, skip ahead to a later step, or
// pivot into a different workflow entirely.
function ReactionSelect({
  value,
  index,
  allSteps,
  endings,
  otherWorkflowNames,
  noneLabel,
  onChange,
}: {
  value: Reaction;
  index: number;
  allSteps: SimpleStep[];
  endings: Ending[];
  otherWorkflowNames: string[];
  noneLabel: string;
  onChange: (r: Reaction) => void;
}) {
  return (
    <select
      value={encodeReaction(value)}
      onChange={(e) => onChange(decodeReaction(e.target.value))}
      className={selectClass}
    >
      <option value="none">{noneLabel}</option>
      {endings.map((en) => (
        <option key={en.id} value={`end:${en.id}`}>
          End with outcome: {en.label}
        </option>
      ))}
      {allSteps.map((s, i) =>
        i > index ? (
          <option key={i} value={`skip:${i}`}>
            Skip to {describeStep(s, i)}
          </option>
        ) : null
      )}
      {otherWorkflowNames.map((name) => (
        <option key={name} value={`wf:${name}`}>
          Switch to workflow: {name}
        </option>
      ))}
    </select>
  );
}

function BranchTargetSelect({
  value,
  index,
  allSteps,
  endings,
  onChange,
}: {
  value: BranchTarget;
  index: number;
  allSteps: SimpleStep[];
  endings: Ending[];
  onChange: (t: BranchTarget) => void;
}) {
  const encoded = value.kind === "end" ? `end:${value.endingId}` : `skip:${value.targetIndex}`;
  return (
    <select
      value={encoded}
      onChange={(e) => {
        const v = e.target.value;
        onChange(
          v.startsWith("end:")
            ? { kind: "end", endingId: v.slice(4) }
            : { kind: "skip", targetIndex: Number(v.slice(5)) }
        );
      }}
      className={selectClass}
    >
      {endings.map((en) => (
        <option key={en.id} value={`end:${en.id}`}>
          End with outcome: {en.label}
        </option>
      ))}
      {allSteps.map((s, i) =>
        i > index ? (
          <option key={i} value={`skip:${i}`}>
            Skip to {describeStep(s, i)}
          </option>
        ) : null
      )}
    </select>
  );
}

export function SendCard({
  step,
  templates,
  onChange,
}: {
  step: Extract<SimpleStep, { kind: "send" }>;
  templates: { name: string; channel: string }[];
  onChange: (step: SimpleStep) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-stone-500 mb-1">Send this template</label>
      {templates.length === 0 ? (
        <p className="text-sm text-amber-700">
          No templates yet — create one on the Templates page first.
        </p>
      ) : (
        <select
          value={step.templateName}
          onChange={(e) => {
            const t = templates.find((tpl) => tpl.name === e.target.value);
            onChange({
              kind: "send",
              templateName: e.target.value,
              channel: (t?.channel as "WHATSAPP" | "EMAIL") ?? step.channel,
            });
          }}
          className={selectClass}
        >
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.channel})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function WaitCard({
  step,
  index,
  allSteps,
  endings,
  otherWorkflowNames,
  onChange,
}: {
  step: Extract<SimpleStep, { kind: "wait" }>;
  index: number;
  allSteps: SimpleStep[];
  endings: Ending[];
  otherWorkflowNames: string[];
  onChange: (step: SimpleStep) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-stone-500 mb-1">Wait for</label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={step.amount}
            onChange={(e) => onChange({ ...step, amount: Number(e.target.value) || 1 })}
            className="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <select
            value={step.unit}
            onChange={(e) => onChange({ ...step, unit: e.target.value as "m" | "h" | "d" })}
            className={selectClass}
          >
            <option value="m">minutes</option>
            <option value="h">hours</option>
            <option value="d">days</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-stone-500 mb-1">If they reply while waiting</label>
        <ReactionSelect
          value={step.onReply}
          index={index}
          allSteps={allSteps}
          endings={endings}
          otherWorkflowNames={otherWorkflowNames}
          noneLabel="Do nothing special — just keep waiting"
          onChange={(r) => onChange({ ...step, onReply: r })}
        />
      </div>

      <div>
        <label className="block text-xs text-stone-500 mb-1">
          If they click a link in the message
        </label>
        <ReactionSelect
          value={step.onClick}
          index={index}
          allSteps={allSteps}
          endings={endings}
          otherWorkflowNames={otherWorkflowNames}
          noneLabel="Do nothing special"
          onChange={(r) => onChange({ ...step, onClick: r })}
        />
        {step.onClick.kind === "workflow" && otherWorkflowNames.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            No other active workflow to switch to yet — this reaction won&apos;t fire
            until one exists.
          </p>
        )}
      </div>
    </div>
  );
}

export function BranchCard({
  step,
  index,
  allSteps,
  endings,
  onChange,
}: {
  step: Extract<SimpleStep, { kind: "branch" }>;
  index: number;
  allSteps: SimpleStep[];
  endings: Ending[];
  onChange: (step: SimpleStep) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-stone-500 mb-1">If the lead&apos;s stage is</label>
        <select
          value={step.stageEquals}
          onChange={(e) => onChange({ ...step, stageEquals: e.target.value })}
          className={selectClass}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-stone-500 mb-1">then</label>
        <BranchTargetSelect
          value={step.then}
          index={index}
          allSteps={allSteps}
          endings={endings}
          onChange={(t) => onChange({ ...step, then: t })}
        />
      </div>
      <p className="text-xs text-stone-400">Otherwise, continues to the next step as normal.</p>
    </div>
  );
}
