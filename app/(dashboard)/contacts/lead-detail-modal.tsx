"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import StageBadge from "./stage-badge";
import { formatAttributeLabel, visibleAttributes } from "./attributes";
import { eventLabel, eventDotClass } from "./event-meta";

type Detail = {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    businessType: string | null;
    attributes: unknown;
    tags: { id: string; name: string }[];
  };
  events: { id: string; type: string; occurredAt: string }[];
};

export default function LeadDetailModal({
  leadId,
  onClose,
  onEdit,
}: {
  leadId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts/${leadId}`)
      .then((res) => res.json().then((body) => ({ res, body })))
      .then(({ res, body }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? "Could not load lead");
        setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Could not load lead");
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const attrs = data
    ? (data.contact.attributes as { stage?: string } | null)
    : null;
  const details = data ? visibleAttributes(data.contact.attributes) : [];

  return (
    <Modal title="Lead details" onClose={onClose} wide>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="text-sm text-stone-500">Loading…</p>
      )}

      {data && (
        <div>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-stone-900">
                {data.contact.name ?? "—"}
              </h3>
              <p className="text-sm text-stone-500 mt-0.5">
                {data.contact.phone}
              </p>
            </div>
            <StageBadge stage={attrs?.stage ?? "new"} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-stone-500">Business type</div>
              <div className="text-stone-900 mt-0.5">
                {data.contact.businessType ?? "—"}
              </div>
            </div>
            {details.map(([key, value]) => (
              <div key={key}>
                <div className="text-stone-500">
                  {formatAttributeLabel(key)}
                </div>
                <div className="text-stone-900 mt-0.5">{String(value)}</div>
              </div>
            ))}
          </div>

          {data.contact.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1">
              {data.contact.tags.map((t) => (
                <span
                  key={t.id}
                  className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={onEdit}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 cursor-pointer"
            >
              Edit lead
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
            >
              Close
            </button>
          </div>

          <h4 className="text-sm font-medium text-stone-700 mt-7 mb-3">
            Activity
          </h4>

          {data.events.length === 0 ? (
            <p className="text-sm text-stone-500">
              No activity yet. Once imports and workflows are running, every
              message and reply will show up here.
            </p>
          ) : (
            <ol className="space-y-0 max-h-60 overflow-y-auto pr-1">
              {data.events.map((e, i) => (
                <li key={e.id} className="relative pl-6 pb-4 last:pb-0">
                  {i !== data.events.length - 1 && (
                    <span className="absolute left-[5px] top-3 bottom-0 w-px bg-stone-200" />
                  )}
                  <span
                    className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${eventDotClass(
                      e.type
                    )}`}
                  />
                  <div className="text-sm text-stone-900">
                    {eventLabel(e.type)}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {new Date(e.occurredAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}
