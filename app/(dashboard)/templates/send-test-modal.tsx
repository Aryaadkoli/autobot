"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/modal";

type Lead = { id: string; name: string | null; phone: string };

export default function SendTestModal({
  templateId,
  templateBody,
  leads,
  onClose,
  onSent,
}: {
  templateId: string;
  templateBody: string;
  leads: Lead[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    renderedBody: string;
    via: string;
  } | null>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === leadId),
    [leads, leadId]
  );

  const preview = selectedLead
    ? templateBody
        .replace(/\{\{\s*name\s*\}\}/g, selectedLead.name ?? "")
        .replace(/\{\{\s*phone\s*\}\}/g, selectedLead.phone)
    : templateBody;

  async function handleSend() {
    if (!leadId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setResult({ renderedBody: data.renderedBody, via: data.via });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Send test message" onClose={onClose}>
      {leads.length === 0 ? (
        <p className="text-sm text-stone-500">
          Add a lead first — there&apos;s no one to send a test to yet.
        </p>
      ) : result ? (
        <div>
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
            Sent via the {result.via} adapter.
          </p>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 whitespace-pre-wrap">
            {result.renderedBody}
          </div>
          <button
            onClick={onClose}
            className="mt-5 rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 cursor-pointer"
          >
            Done
          </button>
        </div>
      ) : (
        <div>
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <label className="block text-sm text-stone-700 mb-1">
            Send test to
          </label>
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ?? l.phone} ({l.phone})
              </option>
            ))}
          </select>

          <label className="block text-sm text-stone-700 mb-1">Preview</label>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 whitespace-pre-wrap mb-5">
            {preview}
          </div>

          <p className="text-xs text-stone-400 mb-4">
            This goes through a mock channel for now — no WhatsApp account
            is connected yet, so nothing actually reaches this lead&apos;s
            phone. It records exactly as a real send would (Message row,
            Activity event) so the rest of the app works today.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleSend}
              disabled={sending || !leadId}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {sending ? "Sending…" : "Send test"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
