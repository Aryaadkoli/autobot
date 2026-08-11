"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import { STAGES } from "./stages";

export type EditableLead = {
  id: string;
  name: string;
  phone: string;
  businessType: string;
  city: string;
  stage: string;
  tagIds: string[];
};

export default function LeadModal({
  lead,
  businessTypes,
  allTags,
  onClose,
  onSaved,
}: {
  lead?: EditableLead;
  businessTypes: { id: string; name: string }[];
  allTags: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!lead;
  const [name, setName] = useState(lead?.name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [businessType, setBusinessType] = useState(lead?.businessType ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [stage, setStage] = useState(lead?.stage ?? "new");
  const [tagIds, setTagIds] = useState<string[]>(lead?.tagIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(id: string) {
    setTagIds((ids) =>
      ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        isEdit ? `/api/contacts/${lead.id}` : "/api/contacts",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            phone: phone.trim(),
            businessType: businessType.trim() || undefined,
            city: city.trim() || undefined,
            stage,
            tagIds,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit lead" : "Add lead"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm text-stone-700 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">
            Business type
          </label>
          <input
            list="business-type-options"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <datalist id="business-type-options">
            {businessTypes.map((bt) => (
              <option key={bt.id} value={bt.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">Stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {allTags.length > 0 && (
          <div>
            <label className="block text-sm text-stone-700 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const active = tagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
                      active
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add lead"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
