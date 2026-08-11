"use client";

import { useState } from "react";
import Modal from "@/components/modal";

type Tag = { id: string; name: string };

export default function TagManagerModal({
  tags,
  onClose,
  onChanged,
}: {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTag.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create tag");
      setNewTag("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create tag");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not rename tag");
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename tag");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tag? It will be removed from all leads.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete tag");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Manage tags" onClose={onClose}>
      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-2 mb-5">
        {tags.length === 0 && (
          <p className="text-sm text-stone-500">No tags yet.</p>
        )}
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2"
          >
            {editingId === tag.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename(tag.id)}
                className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            ) : (
              <span className="text-sm text-stone-800">{tag.name}</span>
            )}

            <div className="flex items-center gap-1 shrink-0">
              {editingId === tag.id ? (
                <>
                  <button
                    disabled={busy}
                    onClick={() => handleRename(tag.id)}
                    className="text-xs text-amber-700 hover:underline cursor-pointer px-1.5"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-stone-500 hover:underline cursor-pointer px-1.5"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditingName(tag.name);
                    }}
                    className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer px-1.5"
                  >
                    Rename
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleDelete(tag.id)}
                    className="text-xs text-red-600 hover:underline cursor-pointer px-1.5"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="New tag name"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          disabled={busy || !newTag.trim()}
          className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
        >
          Add
        </button>
      </form>
    </Modal>
  );
}
