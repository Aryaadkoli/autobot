"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TemplateModal, { type EditableTemplate } from "./template-modal";
import SendTestModal from "./send-test-modal";

type Template = {
  id: string;
  name: string;
  channel: string;
  body: string;
  metaCategory: string | null;
  metaTemplateName: string | null;
  metaLanguage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  variables: { pos: number; source: string }[];
  approvalStatus: string;
  sends: { sent: number; delivered: number; failed: number };
};

type Lead = { id: string; name: string | null; phone: string };

type ModalState =
  | { type: "add" }
  | { type: "edit"; template: Template }
  | { type: "send"; template: Template }
  | null;

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

export default function TemplatesClient({
  templates,
  leads,
}: {
  templates: Template[];
  leads: Lead[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function closeAndRefresh() {
    setModal(null);
    refresh();
  }

  async function handleDelete(template: Template) {
    if (!confirm(`Delete "${template.name}"? This can't be undone.`)) return;
    setDeletingId(template.id);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete template");
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete template");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCheckApproval(template: Template) {
    setCheckingId(template.id);
    try {
      const res = await fetch(`/api/templates/${template.id}/check-approval`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not check approval");
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not check approval");
    } finally {
      setCheckingId(null);
    }
  }

  function toEditable(t: Template): EditableTemplate {
    return {
      id: t.id,
      name: t.name,
      channel: t.channel,
      body: t.body,
      metaCategory: t.metaCategory,
      metaTemplateName: t.metaTemplateName,
      metaLanguage: t.metaLanguage,
      mediaUrl: t.mediaUrl,
      mediaType: t.mediaType,
      variables: t.variables,
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-stone-500 max-w-lg">
          Reusable messages for follow-ups. Sends go through a mock channel
          until a WhatsApp/email account is connected.
        </p>
        <button
          onClick={() => setModal({ type: "add" })}
          className="rounded-lg bg-stone-900 text-white text-sm px-3 py-1.5 hover:bg-stone-800 cursor-pointer shrink-0"
        >
          + New template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-2xl">
          <p className="text-stone-700 font-medium">No templates yet</p>
          <p className="text-sm text-stone-500 mt-1">
            Create one to start sending consistent follow-ups.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs border border-stone-200">
                      {CHANNEL_LABEL[t.channel] ?? t.channel}
                    </span>
                    {t.channel === "WHATSAPP" && (
                      <span
                        className={`ml-1.5 px-2 py-0.5 rounded-full text-xs border ${
                          !t.metaTemplateName
                            ? "bg-stone-50 text-stone-500 border-stone-200"
                            : t.approvalStatus === "APPROVED"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : t.approvalStatus === "REJECTED"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                        title={
                          !t.metaTemplateName
                            ? "No approved Meta template set — test sends only"
                            : t.approvalStatus === "APPROVED"
                              ? `Sends via approved template "${t.metaTemplateName}"`
                              : t.approvalStatus === "REJECTED"
                                ? "Meta rejected this template — edit and resubmit in Meta Business Manager"
                                : "Not yet confirmed approved — click Check approval"
                        }
                      >
                        {!t.metaTemplateName
                          ? "Mock only"
                          : t.approvalStatus === "APPROVED"
                            ? "Live-ready"
                            : t.approvalStatus === "REJECTED"
                              ? "Rejected"
                              : "Pending approval"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600 max-w-xs truncate">
                    {t.body}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {t.sends.sent === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <span
                        title={`${t.sends.delivered} delivered, ${t.sends.failed} failed`}
                      >
                        {t.sends.sent}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {t.channel === "WHATSAPP" && t.metaTemplateName && (
                        <button
                          disabled={checkingId === t.id}
                          onClick={() => handleCheckApproval(t)}
                          className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer disabled:opacity-50"
                        >
                          {checkingId === t.id ? "Checking…" : "Check approval"}
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ type: "send", template: t })}
                        className="text-xs text-amber-700 hover:underline cursor-pointer"
                      >
                        Send test
                      </button>
                      <button
                        onClick={() => setModal({ type: "edit", template: t })}
                        className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t)}
                        className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === t.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === "add" && (
        <TemplateModal onClose={() => setModal(null)} onSaved={closeAndRefresh} />
      )}

      {modal?.type === "edit" && (
        <TemplateModal
          template={toEditable(modal.template)}
          onClose={() => setModal(null)}
          onSaved={closeAndRefresh}
        />
      )}

      {modal?.type === "send" && (
        <SendTestModal
          templateId={modal.template.id}
          templateBody={modal.template.body}
          leads={leads}
          onClose={() => setModal(null)}
          onSent={refresh}
        />
      )}
    </div>
  );
}
