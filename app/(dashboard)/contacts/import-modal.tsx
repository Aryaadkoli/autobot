"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import ColumnMappingTable from "@/components/column-mapping-table";
import { downloadSampleLeadsCsv } from "@/lib/sample-csv";

type PreviewData = {
  filename: string;
  headers: string[];
  rows: Record<string, unknown>[];
  columnMapping: Record<string, string>;
};

type ImportReport = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errorReport: { row: number; error: string }[];
  taggedCounts: Record<string, number>;
};

export default function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/imports/preview", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read file");
      setPreview(data);
      setMapping(data.columnMapping);
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleImport() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: preview.filename,
          columnMapping: mapping,
          rows: preview.rows,
          tag: tag.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setReport(data);
      setStep("result");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setPreview(null);
    setMapping({});
    setTag("");
    setReport(null);
    setError(null);
  }

  const hasPhone = Object.values(mapping).includes("phone");

  return (
    <Modal title="Import leads" onClose={onClose} wide>
      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {step === "upload" && (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center">
          <p className="text-stone-700 font-medium">Upload a lead list</p>
          <p className="text-sm text-stone-500 mt-1 mb-5">
            Excel (.xlsx) or CSV — up to 5,000 rows.
          </p>
          <label className="inline-block cursor-pointer rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800">
            {loading ? "Reading file…" : "Choose file"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={loading}
              onChange={handleFile}
            />
          </label>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => downloadSampleLeadsCsv()}
              className="text-sm text-stone-500 hover:text-stone-800 underline cursor-pointer"
            >
              Download a sample CSV template
            </button>
          </div>
        </div>
      )}

      {step === "map" && preview && (
        <div>
          <p className="text-sm text-stone-500 mb-4">
            {preview.filename} — {preview.rows.length} rows detected. Map each
            column, then confirm.
          </p>

          <ColumnMappingTable
            headers={preview.headers}
            sampleRow={preview.rows[0] ?? {}}
            mapping={mapping}
            onChange={(header, value) =>
              setMapping((m) => ({ ...m, [header]: value }))
            }
          />

          {!hasPhone && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Map one column to Phone to continue.
            </p>
          )}

          <label className="block text-sm text-stone-700 mb-1">
            Tag all imported leads (optional)
          </label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. trade-fair-2026"
            className="w-full max-w-xs mb-5 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={!hasPhone || loading}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {loading ? "Importing…" : `Import ${preview.rows.length} rows`}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "result" && report && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-4">
              <div className="text-2xl font-semibold text-stone-900">
                {report.totalRows}
              </div>
              <div className="text-xs text-stone-500 mt-1">Total rows</div>
            </div>
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <div className="text-2xl font-semibold text-green-700">
                {report.importedRows}
              </div>
              <div className="text-xs text-stone-500 mt-1">Imported</div>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <div className="text-2xl font-semibold text-red-700">
                {report.failedRows}
              </div>
              <div className="text-xs text-stone-500 mt-1">Failed</div>
            </div>
          </div>

          {Object.keys(report.taggedCounts).length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Auto-tagged by rules
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.taggedCounts).map(([name, count]) => (
                  <span
                    key={name}
                    className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
                  >
                    {name} × {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.errorReport.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Row errors
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200">
                <table className="w-full text-sm">
                  <tbody>
                    {report.errorReport.map((e) => (
                      <tr
                        key={e.row}
                        className="border-b border-stone-100 last:border-0"
                      >
                        <td className="px-3 py-1.5 text-stone-500 w-16">
                          Row {e.row}
                        </td>
                        <td className="px-3 py-1.5 text-red-700">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
            >
              Import another file
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
