"use client";

import { useState } from "react";
import { STAGES } from "../contacts/stages";

export default function EnrollModal({
  workflowId,
  workflowName,
  tags,
  onClose,
  onEnrolled,
}: {
  workflowId: string;
  workflowName: string;
  tags: { id: string; name: string }[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [tagId, setTagId] = useState("");
  const [stage, setStage] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    enrolled: number;
    alreadyActive: number;
    total: number;
    truncated?: boolean;
  } | null>(null);

  async function handleEnroll() {
    setEnrolling(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tagId || undefined, stage: stage || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not enroll leads");
      setResult(data);
      onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enroll leads");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-stone-800 mb-1">Enroll leads</h2>
        <p className="text-sm text-stone-500 mb-4">
          Into <span className="font-medium text-stone-700">{workflowName}</span>
        </p>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
            {result.enrolled} newly enrolled
            {result.alreadyActive > 0 && `, ${result.alreadyActive} already running it`}
            {" "}(of {result.total} matching lead{result.total === 1 ? "" : "s"}
            {result.truncated ? ", first 200" : ""})
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm text-stone-700 mb-1">Tag</label>
            <select
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-stone-700 mb-1">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Any stage</option>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            {enrolling ? "Enrolling…" : "Enroll matching leads"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
