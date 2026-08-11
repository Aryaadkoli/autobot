"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES } from "../contacts/stages";
import ColumnMappingTable from "@/components/column-mapping-table";
import { downloadSampleLeadsCsv } from "@/lib/sample-csv";
import ScheduleCalendar from "./schedule-calendar";

type Template = {
  id: string;
  name: string;
  channel: string;
  metaTemplateName: string | null;
};
type Tag = { id: string; name: string };
type HistoryItem = {
  id: string;
  templateName: string;
  source: string;
  targetedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
};
type ScheduledItem = {
  id: string;
  name: string;
  templateName: string;
  tagName: string | null;
  stage: string | null;
  scheduledFor: string;
  status: string;
  recurrence: string;
  errorMessage: string | null;
};

const RECURRENCE_LABEL: Record<string, string> = {
  NONE: "One-time",
  MONTHLY: "Repeats monthly",
  YEARLY: "Repeats yearly",
};

type SendResult = {
  totalTargeted: number;
  sent: number;
  failed: number;
  skipped: Record<string, number>;
  truncated: boolean;
};

type UploadPreview = {
  filename: string;
  headers: string[];
  rows: Record<string, unknown>[];
  columnMapping: Record<string, string>;
};

export default function CampaignsClient({
  templates,
  tags,
  history,
  scheduled,
}: {
  templates: Template[];
  tags: Tag[];
  history: HistoryItem[];
  scheduled: ScheduledItem[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"filter" | "upload">("filter");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  // Filter mode
  const [tagId, setTagId] = useState("");
  const [stage, setStage] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(
    null
  );

  // Schedule for later (filter mode only)
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleRecurrence, setScheduleRecurrence] = useState<
    "NONE" | "MONTHLY" | "YEARLY"
  >("NONE");
  const [scheduledView, setScheduledView] = useState<"list" | "calendar">(
    "calendar"
  );

  // Upload mode
  const [uploadStep, setUploadStep] = useState<"upload" | "map">("upload");
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listTag, setListTag] = useState("");
  const [uploading, setUploading] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [scheduledOk, setScheduledOk] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    totalRows: number;
    importedRows: number;
    failedRows: number;
  } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "filter") return;
    const params = new URLSearchParams();
    if (tagId) params.set("tagId", tagId);
    if (stage) params.set("stage", stage);
    fetch(`/api/campaigns/preview?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setPreview({ count: data.count ?? 0, sample: data.sample ?? [] }))
      .catch(() => setPreview(null));
  }, [mode, tagId, stage]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const hasPhoneMapped = Object.values(mapping).includes("phone");

  // Recipients to show in the right-hand panel.
  const uploadRecipients = (() => {
    if (!uploadPreview) return [];
    const nameHeader = Object.entries(mapping).find(([, v]) => v === "name")?.[0];
    const phoneHeader = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];
    return uploadPreview.rows.map((row) => {
      const name = nameHeader ? String(row[nameHeader] ?? "") : "";
      const phone = phoneHeader ? String(row[phoneHeader] ?? "") : "";
      return name || phone || "(unnamed row)";
    });
  })();

  function resetUpload() {
    setUploadStep("upload");
    setUploadPreview(null);
    setMapping({});
    setListTag("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/imports/preview", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read file");
      setUploadPreview(data);
      setMapping(data.columnMapping);
      setUploadStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSendFilter() {
    if (!templateId) return;
    if (
      !confirm(
        `Send to ${preview?.count ?? "an unknown number of"} lead${
          preview?.count === 1 ? "" : "s"
        } now? This can't be undone.`
      )
    )
      return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          tagId: tagId || undefined,
          stage: stage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Campaign failed");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign failed");
    } finally {
      setSending(false);
    }
  }

  async function handleScheduleFilter() {
    if (!templateId || !scheduleName.trim() || !scheduleAt) return;
    setSending(true);
    setError(null);
    setScheduledOk(false);
    try {
      const res = await fetch("/api/scheduled-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleName.trim(),
          templateId,
          tagId: tagId || undefined,
          stage: stage || undefined,
          scheduledFor: new Date(scheduleAt).toISOString(),
          recurrence: scheduleRecurrence,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not schedule campaign");
      setScheduledOk(true);
      setScheduleName("");
      setScheduleAt("");
      setScheduleRecurrence("NONE");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule campaign");
    } finally {
      setSending(false);
    }
  }

  async function handleSendUpload() {
    if (!templateId || !uploadPreview) return;
    if (
      !confirm(
        `This will add/update ${uploadPreview.rows.length} lead(s) from "${uploadPreview.filename}" and send them this template. Continue?`
      )
    )
      return;
    setSending(true);
    setError(null);
    setResult(null);
    setImportSummary(null);
    try {
      const res = await fetch("/api/campaigns/from-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: uploadPreview.filename,
          columnMapping: mapping,
          rows: uploadPreview.rows,
          templateId,
          tag: listTag.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Campaign failed");
      setImportSummary(data.importResult);
      setResult(data.campaignResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign failed");
    } finally {
      setSending(false);
    }
  }

  async function handleCancelScheduled(id: string) {
    if (!confirm("Cancel this scheduled campaign?")) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/scheduled-campaigns/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not cancel");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setCancellingId(null);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-2xl">
        <p className="text-stone-700 font-medium">No templates yet</p>
        <p className="text-sm text-stone-500 mt-1">
          Create one on the Templates page first.
        </p>
      </div>
    );
  }

  const pendingScheduled = scheduled.filter((s) => s.status === "PENDING");
  const recipientList = mode === "filter" ? preview?.sample ?? [] : uploadRecipients;
  const recipientCount = mode === "filter" ? preview?.count ?? 0 : uploadRecipients.length;

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 p-6">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="mb-4">
            <label className="block text-sm text-stone-700 mb-1">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.channel})
                </option>
              ))}
            </select>
            {selectedTemplate?.channel === "WHATSAPP" && !selectedTemplate.metaTemplateName && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                This template has no approved Meta template name set — sends
                will go through the mock channel until one is set on the
                Templates page.
              </p>
            )}
          </div>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setMode("filter")}
              className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                mode === "filter"
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
              }`}
            >
              Filter existing leads
            </button>
            <button
              onClick={() => {
                setMode("upload");
                setWhen("now");
              }}
              className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                mode === "upload"
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
              }`}
            >
              Upload a list
            </button>
          </div>

          {mode === "filter" && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm text-stone-700 mb-1">
                    Filter by tag
                  </label>
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
                  <label className="block text-sm text-stone-700 mb-1">
                    Filter by stage
                  </label>
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

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setWhen("now")}
                  className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                    when === "now"
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  Send now
                </button>
                <button
                  onClick={() => setWhen("later")}
                  className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                    when === "later"
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  Schedule for later
                </button>
              </div>

              {when === "now" ? (
                <>
                  <p className="text-sm text-stone-600 mb-5">
                    This will target{" "}
                    <span className="font-medium text-stone-900">
                      {preview === null ? "…" : preview.count}
                    </span>{" "}
                    lead{preview?.count === 1 ? "" : "s"}
                    {preview !== null &&
                      preview.count > 200 &&
                      " (only the first 200 sent this run)"}
                    .
                  </p>
                  <button
                    onClick={handleSendFilter}
                    disabled={sending || !templateId || preview?.count === 0}
                    className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                  >
                    {sending ? "Sending…" : "Send campaign"}
                  </button>
                </>
              ) : (
                <>
                  {scheduledOk && (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
                      Scheduled — it will send automatically at the chosen time.
                    </p>
                  )}
                  <div className="mb-3">
                    <label className="block text-sm text-stone-700 mb-1">
                      Name this campaign
                    </label>
                    <input
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                      placeholder="e.g. Mango farmers — January reminder"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-sm text-stone-700 mb-1">
                        Send at
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-stone-700 mb-1">
                        Repeat
                      </label>
                      <select
                        value={scheduleRecurrence}
                        onChange={(e) =>
                          setScheduleRecurrence(
                            e.target.value as "NONE" | "MONTHLY" | "YEARLY"
                          )
                        }
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="NONE">Never (one-time)</option>
                        <option value="MONTHLY">Every month</option>
                        <option value="YEARLY">Every year</option>
                      </select>
                    </div>
                  </div>
                  {scheduleRecurrence !== "NONE" && (
                    <p className="text-xs text-stone-500 -mt-2 mb-4">
                      After each send, the next occurrence is queued up
                      automatically — e.g. same mango farmers, same message,
                      same date next {scheduleRecurrence === "MONTHLY" ? "month" : "year"}.
                    </p>
                  )}
                  <p className="text-sm text-stone-600 mb-4">
                    Will target whoever matches this filter at send time —{" "}
                    <span className="font-medium text-stone-900">
                      {preview === null ? "…" : preview.count}
                    </span>{" "}
                    lead{preview?.count === 1 ? "" : "s"} right now.
                  </p>
                  <button
                    onClick={handleScheduleFilter}
                    disabled={sending || !templateId || !scheduleName.trim() || !scheduleAt}
                    className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                  >
                    {sending ? "Scheduling…" : "Schedule campaign"}
                  </button>
                </>
              )}
            </div>
          )}

          {mode === "upload" && (
            <div>
              {uploadStep === "upload" && (
                <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center">
                  <p className="text-stone-700 font-medium">Upload a lead list</p>
                  <p className="text-sm text-stone-500 mt-1 mb-4">
                    Excel (.xlsx) or CSV. New numbers become leads
                    automatically; existing leads (matched by phone) are
                    updated, not duplicated.
                  </p>
                  <label className="inline-block cursor-pointer rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800">
                    {uploading ? "Reading file…" : "Choose file"}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleFile}
                    />
                  </label>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => downloadSampleLeadsCsv("campaign-list-template.csv")}
                      className="text-sm text-stone-500 hover:text-stone-800 underline cursor-pointer"
                    >
                      Download a sample CSV template
                    </button>
                  </div>
                </div>
              )}

              {uploadStep === "map" && uploadPreview && (
                <div>
                  <p className="text-sm text-stone-500 mb-4">
                    {uploadPreview.filename} — {uploadPreview.rows.length} rows
                    detected. Map each column, then confirm.
                  </p>

                  <ColumnMappingTable
                    headers={uploadPreview.headers}
                    sampleRow={uploadPreview.rows[0] ?? {}}
                    mapping={mapping}
                    onChange={(header, value) =>
                      setMapping((m) => ({ ...m, [header]: value }))
                    }
                  />

                  {!hasPhoneMapped && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                      Map one column to Phone to continue.
                    </p>
                  )}

                  <label className="block text-sm text-stone-700 mb-1">
                    Tag these leads (optional)
                  </label>
                  <input
                    value={listTag}
                    onChange={(e) => setListTag(e.target.value)}
                    placeholder="e.g. diwali-2026"
                    className="w-full max-w-xs mb-5 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={handleSendUpload}
                      disabled={!hasPhoneMapped || sending}
                      className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                    >
                      {sending
                        ? "Sending…"
                        : `Add & send to ${uploadPreview.rows.length} rows`}
                    </button>
                    <button
                      onClick={resetUpload}
                      className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {importSummary && (
            <div className="mt-6 border-t border-stone-200 pt-5">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Leads added/updated
              </p>
              <p className="text-sm text-stone-600">
                {importSummary.importedRows} of {importSummary.totalRows} rows
                processed
                {importSummary.failedRows > 0 &&
                  ` — ${importSummary.failedRows} failed (bad phone numbers, etc.)`}
                .
              </p>
            </div>
          )}

          {result && (
            <div className="mt-6 border-t border-stone-200 pt-5">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Message results
              </p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                  <div className="text-2xl font-semibold text-green-700">
                    {result.sent}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">Sent</div>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                  <div className="text-2xl font-semibold text-red-700">
                    {result.failed}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">Failed</div>
                </div>
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-4">
                  <div className="text-2xl font-semibold text-stone-700">
                    {Object.values(result.skipped).reduce((a, b) => a + b, 0)}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">Skipped</div>
                </div>
              </div>
              {Object.keys(result.skipped).length > 0 && (
                <div className="text-sm text-stone-600 space-y-1">
                  {Object.entries(result.skipped).map(([reason, count]) => (
                    <div key={reason}>
                      {count} skipped — {reason}
                    </div>
                  ))}
                </div>
              )}
              {result.truncated && (
                <p className="text-xs text-stone-500 mt-3">
                  Only the first 200 matching leads were sent this run. Run
                  it again to continue with the rest.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium text-stone-700 mb-3">
            Recipients
            {recipientCount > 0 && (
              <span className="text-stone-400 font-normal"> ({recipientCount})</span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-stone-200 max-h-[420px] overflow-y-auto">
            {recipientList.length === 0 ? (
              <p className="text-sm text-stone-500 p-4">
                {mode === "filter"
                  ? "No leads match this filter yet."
                  : "Upload a file to see who'll receive it."}
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {recipientList.map((name, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm text-stone-700">
                    {name}
                  </li>
                ))}
              </ul>
            )}
            {mode === "filter" && recipientCount > recipientList.length && (
              <p className="text-xs text-stone-400 px-4 py-2.5 border-t border-stone-100">
                +{recipientCount - recipientList.length} more
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="text-sm font-medium text-stone-700">
          Upcoming scheduled campaigns
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setScheduledView("calendar")}
            className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
              scheduledView === "calendar"
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => setScheduledView("list")}
            className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
              scheduledView === "list"
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
            }`}
          >
            List
          </button>
        </div>
      </div>
      {pendingScheduled.length === 0 ? (
        <p className="text-sm text-stone-500 mb-8">Nothing scheduled.</p>
      ) : scheduledView === "calendar" ? (
        <div className="mb-8">
          <ScheduleCalendar
            scheduled={scheduled}
            onCancel={handleCancelScheduled}
            cancellingId={cancellingId}
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Sends at</th>
                <th className="px-4 py-3 font-medium">Repeat</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingScheduled.map((s) => (
                <tr key={s.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-900">{s.name}</td>
                  <td className="px-4 py-3 text-stone-600">{s.templateName}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {s.tagName ? `Tag: ${s.tagName}` : s.stage ? `Stage: ${s.stage}` : "All leads"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {new Date(s.scheduledFor).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {RECURRENCE_LABEL[s.recurrence] ?? s.recurrence}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={cancellingId === s.id}
                      onClick={() => handleCancelScheduled(s.id)}
                      className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {cancellingId === s.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-medium text-stone-700 mb-3">
        Recent campaigns
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-stone-500">No campaigns sent yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-600">
                    {new Date(h.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 text-stone-900">{h.templateName}</td>
                  <td className="px-4 py-3 text-stone-600">{h.source}</td>
                  <td className="px-4 py-3 text-green-700">{h.sentCount}</td>
                  <td className="px-4 py-3 text-red-700">{h.failedCount}</td>
                  <td className="px-4 py-3 text-stone-500">{h.skippedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
