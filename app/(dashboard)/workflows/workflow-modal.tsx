"use client";

import { useState } from "react";
import {
  buildDefinitionFromSteps,
  tryParseSimpleWorkflow,
  newEndingId,
  type SimpleStep,
  type Ending,
  type Reaction,
  type BranchTarget,
} from "./simple-builder";
import { describeStep, SendCard, WaitCard, BranchCard } from "./step-card";

export type EditableWorkflow = {
  id: string;
  name: string;
  definition: unknown;
};

const DEFAULT_ENDINGS: Ending[] = [{ id: "done", label: "Completed" }];

function defaultStep(kind: SimpleStep["kind"], templates: { name: string; channel: string }[], endings: Ending[]): SimpleStep {
  if (kind === "send") {
    const first = templates[0];
    return { kind: "send", templateName: first?.name ?? "", channel: (first?.channel as "WHATSAPP" | "EMAIL") ?? "WHATSAPP" };
  }
  if (kind === "wait") {
    return { kind: "wait", amount: 48, unit: "h", onReply: { kind: "none" }, onClick: { kind: "none" } };
  }
  // "End with outcome: <default>" is always a valid target regardless of
  // position — a fixed step index default could point earlier/nowhere.
  return { kind: "branch", stageEquals: "interested", then: { kind: "end", endingId: endings[0]?.id ?? "done" } };
}

// A step is "referenced" if another step's reaction/branch points at it
// by index — deletion is blocked rather than silently breaking that
// reference, so the guided model never ends up pointing at nothing.
function referencingSteps(steps: SimpleStep[], targetIndex: number): number[] {
  const refs: number[] = [];
  steps.forEach((s, i) => {
    if (s.kind === "wait") {
      if (s.onReply.kind === "skip" && s.onReply.targetIndex === targetIndex) refs.push(i);
      if (s.onClick.kind === "skip" && s.onClick.targetIndex === targetIndex) refs.push(i);
    }
    if (s.kind === "branch" && s.then.kind === "skip" && s.then.targetIndex === targetIndex) refs.push(i);
  });
  return refs;
}

function referencingEndings(steps: SimpleStep[], endingId: string): number[] {
  const refs: number[] = [];
  steps.forEach((s, i) => {
    if (s.kind === "wait") {
      if (s.onReply.kind === "end" && s.onReply.endingId === endingId) refs.push(i);
      if (s.onClick.kind === "end" && s.onClick.endingId === endingId) refs.push(i);
    }
    if (s.kind === "branch" && s.then.kind === "end" && s.then.endingId === endingId) refs.push(i);
  });
  return refs;
}

function shiftReaction(r: Reaction, removedIndex: number): Reaction {
  return r.kind === "skip" && r.targetIndex > removedIndex ? { kind: "skip", targetIndex: r.targetIndex - 1 } : r;
}
function shiftBranchTarget(t: BranchTarget, removedIndex: number): BranchTarget {
  return t.kind === "skip" && t.targetIndex > removedIndex ? { kind: "skip", targetIndex: t.targetIndex - 1 } : t;
}

function removeStepAndReindex(steps: SimpleStep[], removedIndex: number): SimpleStep[] {
  return steps
    .filter((_, i) => i !== removedIndex)
    .map((s) => {
      if (s.kind === "wait") {
        return { ...s, onReply: shiftReaction(s.onReply, removedIndex), onClick: shiftReaction(s.onClick, removedIndex) };
      }
      if (s.kind === "branch") {
        return { ...s, then: shiftBranchTarget(s.then, removedIndex) };
      }
      return s;
    });
}

export default function WorkflowModal({
  workflow,
  services,
  templates,
  otherWorkflowNames,
  onClose,
  onSaved,
}: {
  workflow?: EditableWorkflow;
  services: { id: string; name: string; priority: number }[];
  templates: { name: string; channel: string }[];
  otherWorkflowNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");

  const parsedExisting = workflow
    ? tryParseSimpleWorkflow(workflow.definition as { entry: string; steps: Record<string, unknown> })
    : { steps: [], endings: DEFAULT_ENDINGS };
  const [mode, setMode] = useState<"guided" | "advanced">(
    workflow && parsedExisting === null ? "advanced" : "guided"
  );
  const [steps, setSteps] = useState<SimpleStep[]>(parsedExisting?.steps ?? []);
  const [endings, setEndings] = useState<Ending[]>(parsedExisting?.endings ?? DEFAULT_ENDINGS);
  const [definitionText, setDefinitionText] = useState(
    workflow ? JSON.stringify(workflow.definition, null, 2) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchToAdvanced() {
    const def = buildDefinitionFromSteps(steps, endings);
    setDefinitionText(JSON.stringify(def, null, 2));
    setMode("advanced");
  }

  function addStep(kind: SimpleStep["kind"]) {
    setSteps((prev) => [...prev, defaultStep(kind, templates, endings)]);
  }

  function updateStep(index: number, next: SimpleStep) {
    setSteps((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function removeStep(index: number) {
    const refs = referencingSteps(steps, index);
    if (refs.length > 0) {
      alert(
        `Step ${index + 1} is a skip target for step${refs.length > 1 ? "s" : ""} ${refs
          .map((i) => i + 1)
          .join(", ")} — change or remove that reaction first.`
      );
      return;
    }
    setSteps((prev) => removeStepAndReindex(prev, index));
  }

  function addEnding() {
    const label = prompt('Name this outcome (e.g. "Replied", "Interested", "Lost")');
    if (!label || !label.trim()) return;
    setEndings((prev) => [...prev, { id: newEndingId(), label: label.trim() }]);
  }

  function renameEnding(id: string, label: string) {
    setEndings((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e)));
  }

  function removeEnding(id: string) {
    const refs = referencingEndings(steps, id);
    if (refs.length > 0) {
      alert(
        `This outcome is used by step${refs.length > 1 ? "s" : ""} ${refs
          .map((i) => i + 1)
          .join(", ")} — change that reaction first.`
      );
      return;
    }
    setEndings((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let definition: unknown;
    if (mode === "guided") {
      if (steps.length === 0) {
        setError("Add at least one step.");
        setSaving(false);
        return;
      }
      definition = buildDefinitionFromSteps(steps, endings);
    } else {
      try {
        definition = JSON.parse(definitionText);
      } catch {
        setError("That's not valid JSON — check for a missing comma or bracket.");
        setSaving(false);
        return;
      }
    }

    try {
      const res = workflow
        ? await fetch(`/api/workflows/${workflow.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, definition }),
          })
        : await fetch("/api/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, serviceId, definition }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-stone-800 mb-4">
          {workflow ? "Edit workflow" : "New workflow"}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {error}
            </p>
          )}
          {workflow && mode === "advanced" && parsedExisting === null && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This workflow has logic the guided builder can&apos;t show yet (a
              loop, a backward jump, or a branch on something other than
              stage) — edit it as JSON below.
            </p>
          )}

          <div>
            <label className="block text-sm text-stone-700 mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mango season intro + reply check"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {!workflow && (
            <div>
              <label className="block text-sm text-stone-700 mb-1">Service</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (priority {s.priority})
                  </option>
                ))}
              </select>
              <p className="text-xs text-stone-500 mt-1">
                Lower priority number wins when a contact is in two flows at
                once — e.g. a payment reminder should outrank a marketing
                sequence.
              </p>
            </div>
          )}

          {mode === "guided" ? (
            <div>
              <label className="block text-sm text-stone-700 mb-2">Steps</label>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="rounded-xl border border-stone-200 p-3 bg-stone-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-stone-700">
                        {describeStep(step, i)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    {step.kind === "send" && (
                      <SendCard step={step} templates={templates} onChange={(s) => updateStep(i, s)} />
                    )}
                    {step.kind === "wait" && (
                      <WaitCard
                        step={step}
                        index={i}
                        allSteps={steps}
                        endings={endings}
                        otherWorkflowNames={otherWorkflowNames}
                        onChange={(s) => updateStep(i, s)}
                      />
                    )}
                    {step.kind === "branch" && (
                      <BranchCard
                        step={step}
                        index={i}
                        allSteps={steps}
                        endings={endings}
                        onChange={(s) => updateStep(i, s)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {steps.length === 0 && (
                <p className="text-sm text-stone-500 mb-3">
                  No steps yet — add the first one below.
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => addStep("send")}
                  className="rounded-lg border border-stone-300 text-stone-700 text-xs px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
                >
                  + Send a message
                </button>
                <button
                  type="button"
                  onClick={() => addStep("wait")}
                  className="rounded-lg border border-stone-300 text-stone-700 text-xs px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
                >
                  + Wait
                </button>
                <button
                  type="button"
                  onClick={() => addStep("branch")}
                  className="rounded-lg border border-stone-300 text-stone-700 text-xs px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
                >
                  + Check lead&apos;s stage
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-3">
                Runs top to bottom automatically, finishing with whichever
                outcome below is reached.
              </p>

              <div className="mt-5 pt-4 border-t border-stone-200">
                <label className="block text-sm text-stone-700 mb-2">Outcomes</label>
                <div className="space-y-2">
                  {endings.map((en, i) => (
                    <div key={en.id} className="flex items-center gap-2">
                      <input
                        value={en.label}
                        onChange={(e) => renameEnding(en.id, e.target.value)}
                        className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      {i === 0 ? (
                        <span className="text-xs text-stone-400 shrink-0 w-28">
                          default ending
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeEnding(en.id)}
                          className="text-xs text-red-600 hover:underline cursor-pointer shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addEnding}
                  className="text-xs text-stone-500 hover:text-stone-800 hover:underline cursor-pointer mt-2"
                >
                  + Add another outcome (e.g. &quot;Replied&quot;, &quot;Lost&quot;)
                </button>
                <p className="text-xs text-stone-400 mt-2">
                  The first outcome is reached automatically once every step
                  finishes with no special reaction firing. Add more if you
                  want to track different results separately (e.g. one
                  outcome for &quot;replied&quot;, another for &quot;never
                  responded&quot;).
                </p>
              </div>

              <button
                type="button"
                onClick={switchToAdvanced}
                className="text-xs text-stone-500 hover:text-stone-800 hover:underline cursor-pointer mt-4"
              >
                Prefer to write this as JSON instead?
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-stone-700 mb-1">Steps (JSON)</label>
              <textarea
                required
                spellCheck={false}
                value={definitionText}
                onChange={(e) => setDefinitionText(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-stone-500 mt-1">
                Step types: <code className="px-1 bg-stone-100 rounded">send</code>,{" "}
                <code className="px-1 bg-stone-100 rounded">wait</code>,{" "}
                <code className="px-1 bg-stone-100 rounded">branch</code>,{" "}
                <code className="px-1 bg-stone-100 rounded">end</code>. Template
                names must match a Template&apos;s internal name exactly.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
