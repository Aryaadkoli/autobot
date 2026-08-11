"use client";

import { useState } from "react";
import Modal from "@/components/modal";

type Variable = { pos: number; source: string };

export type EditableTemplate = {
  id: string;
  name: string;
  channel: string;
  body: string;
  metaCategory: string | null;
  metaTemplateName: string | null;
  metaLanguage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  variables: Variable[];
};

const SOURCE_OPTIONS = [
  { value: "contact.name", label: "Lead name" },
  { value: "contact.phone", label: "Lead phone" },
  { value: "attributes.city", label: "City" },
  { value: "custom", label: "Custom attribute…" },
];

export default function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template?: EditableTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [channel, setChannel] = useState(template?.channel ?? "WHATSAPP");
  const [body, setBody] = useState(template?.body ?? "");
  const [metaCategory, setMetaCategory] = useState(template?.metaCategory ?? "UTILITY");
  const [metaTemplateName, setMetaTemplateName] = useState(
    template?.metaTemplateName ?? ""
  );
  const [metaLanguage, setMetaLanguage] = useState(template?.metaLanguage ?? "en");
  const [mediaUrl, setMediaUrl] = useState(template?.mediaUrl ?? "");
  const [mediaType, setMediaType] = useState(template?.mediaType ?? "IMAGE");
  const [variables, setVariables] = useState<Variable[]>(template?.variables ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addVariable() {
    setVariables((v) => [...v, { pos: v.length + 1, source: "contact.name" }]);
  }

  function updateVariable(index: number, source: string) {
    setVariables((v) => v.map((item, i) => (i === index ? { ...item, source } : item)));
  }

  function removeVariable(index: number) {
    setVariables((v) =>
      v.filter((_, i) => i !== index).map((item, i) => ({ ...item, pos: i + 1 }))
    );
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/templates/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setMediaUrl(data.url);
      setMediaType(data.mediaType);
      if (!data.isPubliclyReachable) {
        setError(
          "Uploaded, but this URL only works once the app is deployed publicly — WhatsApp's servers can't reach localhost. Paste a public image/PDF link instead if you need it to work right now."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        isEdit ? `/api/templates/${template.id}` : "/api/templates",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            channel,
            body,
            metaCategory: channel === "WHATSAPP" ? metaCategory : undefined,
            metaTemplateName:
              channel === "WHATSAPP" ? metaTemplateName.trim() || undefined : undefined,
            metaLanguage: channel === "WHATSAPP" ? metaLanguage.trim() || "en" : undefined,
            mediaUrl: mediaUrl.trim(),
            mediaType: mediaUrl.trim() ? mediaType : undefined,
            variables,
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
    <Modal title={isEdit ? "Edit template" : "New template"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm text-stone-700 mb-1">
            Internal name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. lead_intro_1"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>

        {channel === "WHATSAPP" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-stone-700 mb-1">
                  Meta category
                </label>
                <select
                  value={metaCategory}
                  onChange={(e) => setMetaCategory(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="UTILITY">Utility (~₹0.115/msg)</option>
                  <option value="MARKETING">Marketing (~₹0.86/msg)</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-stone-700 mb-1">
                  Language code
                </label>
                <input
                  value={metaLanguage}
                  onChange={(e) => setMetaLanguage(e.target.value)}
                  placeholder="en"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-stone-700 mb-1">
                Approved Meta template name
              </label>
              <input
                value={metaTemplateName}
                onChange={(e) => setMetaTemplateName(e.target.value)}
                placeholder="Leave blank until approved in Meta Business Manager"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-stone-500 mt-1">
                Must exactly match a template you&apos;ve already created and
                gotten approved in Meta Business Manager. Without this, real
                sends only work as replies within an open chat — not for
                cold outreach.
              </p>
            </div>

            <div>
              <label className="block text-sm text-stone-700 mb-1">
                Image or PDF (pamphlet)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://... (public image or PDF link)"
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <label className="shrink-0 cursor-pointer rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-2 hover:bg-stone-100">
                  {uploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleUpload}
                  />
                </label>
              </div>
              {mediaUrl && mediaType === "IMAGE" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl}
                  alt="Template media preview"
                  className="mt-2 h-20 rounded-lg border border-stone-200 object-cover"
                />
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm text-stone-700 mb-1">Message</label>
          <textarea
            required
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === "WHATSAPP"
                ? "Hi {{1}}, your order in {{2}} is ready..."
                : "Hi {{name}}, ..."
            }
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-stone-500 mt-1">
            {channel === "WHATSAPP"
              ? "Use numbered placeholders {{1}}, {{2}}… matching the variables below, and matching your approved Meta template exactly."
              : "Use {{name}}, {{phone}}, or {{any_attribute}} — filled in from the lead when sent."}
          </p>
        </div>

        {channel === "WHATSAPP" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm text-stone-700">Variables</label>
              <button
                type="button"
                onClick={addVariable}
                className="text-xs text-amber-700 hover:underline cursor-pointer"
              >
                + Add variable
              </button>
            </div>
            {variables.length === 0 ? (
              <p className="text-xs text-stone-400">
                No variables — add one per {"{{"}N{"}}"} in your message.
              </p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 w-10 shrink-0">
                      {"{{"}{v.pos}{"}}"}
                    </span>
                    <select
                      value={
                        SOURCE_OPTIONS.some((o) => o.value === v.source)
                          ? v.source
                          : "custom"
                      }
                      onChange={(e) => updateVariable(i, e.target.value)}
                      className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      {SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {(!SOURCE_OPTIONS.some((o) => o.value === v.source) ||
                      v.source === "custom") && (
                      <input
                        value={v.source.startsWith("attributes.") ? v.source.slice(11) : ""}
                        onChange={(e) =>
                          updateVariable(i, `attributes.${e.target.value}`)
                        }
                        placeholder="attribute key"
                        className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeVariable(i)}
                      className="text-xs text-red-600 hover:underline cursor-pointer shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
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
