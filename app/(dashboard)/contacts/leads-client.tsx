"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES } from "./stages";
import StageBadge from "./stage-badge";
import LeadModal, { type EditableLead } from "./lead-modal";
import ImportModal from "./import-modal";
import TagManagerModal from "./tag-manager-modal";
import LeadDetailModal from "./lead-detail-modal";
import TaxonomyManagerModal from "./taxonomy-manager-modal";
import { PAGE_SIZE } from "./constants";

export type LeadRow = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  businessType: string | null;
  city: string | null;
  region: string | null;
  product: string | null;
  stage: string;
  customerStatus: { id: string; name: string } | null;
  leadStage: { id: string; name: string } | null;
  createdAt: string;
  tags: { id: string; name: string }[];
};

type Tag = { id: string; name: string };
type BusinessType = { id: string; name: string };
type CustomerStatus = { id: string; name: string };
type LeadStageOption = { id: string; name: string; customerStatusId: string };

type ModalState =
  | { type: "add" }
  | { type: "edit"; lead: LeadRow }
  | { type: "view"; leadId: string }
  | { type: "import" }
  | { type: "tags" }
  | { type: "taxonomy" }
  | null;

export default function LeadsClient({
  leads,
  allTags,
  businessTypes,
  customerStatuses,
  leadStages,
  canManageTaxonomy,
  activeStage,
  search,
  businessTypeFilter,
  customerStatusFilter,
  leadStageFilter,
  page,
  filteredCount,
  totalLeads,
  newLeadsCount,
  openNewOnLoad,
  openImportOnLoad,
}: {
  leads: LeadRow[];
  allTags: Tag[];
  businessTypes: BusinessType[];
  customerStatuses: CustomerStatus[];
  leadStages: LeadStageOption[];
  canManageTaxonomy: boolean;
  activeStage?: string;
  search: string;
  businessTypeFilter: string;
  customerStatusFilter: string;
  leadStageFilter: string;
  page: number;
  filteredCount: number;
  totalLeads: number;
  newLeadsCount: number;
  openNewOnLoad?: boolean;
  openImportOnLoad?: boolean;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [modal, setModal] = useState<ModalState>(() => {
    if (openImportOnLoad) return { type: "import" };
    if (openNewOnLoad) return { type: "add" };
    return null;
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (openImportOnLoad || openNewOnLoad) {
      router.replace("/contacts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Re-syncs the input when `search` changes for a reason other than our
    // own debounce commit below (browser back/forward, or the Reset
    // button) — a real external-state case, not something derivable
    // during render, since the two are deliberately allowed to diverge
    // while the debounce timer is pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(search);
  }, [search]);

  function refresh() {
    router.refresh();
  }

  function closeAndRefresh() {
    setModal(null);
    refresh();
  }

  function navigate(next: {
    search?: string;
    stage?: string;
    businessType?: string;
    customerStatus?: string;
    leadStage?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const merged = {
      search: next.search ?? search,
      stage: next.stage ?? activeStage ?? "",
      businessType: next.businessType ?? businessTypeFilter,
      customerStatus: next.customerStatus ?? customerStatusFilter,
      leadStage: next.leadStage ?? leadStageFilter,
      page: next.page ?? page,
    };
    if (merged.search) params.set("q", merged.search);
    if (merged.stage) params.set("stage", merged.stage);
    if (merged.businessType) params.set("businessType", merged.businessType);
    if (merged.customerStatus) params.set("customerStatus", merged.customerStatus);
    if (merged.leadStage) params.set("leadStage", merged.leadStage);
    if (merged.page > 1) params.set("page", String(merged.page));
    router.push(`/contacts${params.toString() ? `?${params.toString()}` : ""}`);
  }

  // Any filter change starts over from page 1 — the old page number means
  // something different once the result set itself has changed.
  function updateFilter(patch: Parameters<typeof navigate>[0]) {
    navigate({ ...patch, page: 1 });
  }

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => updateFilter({ search: value }), 400);
  }

  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredCount);

  const hasActiveFilters = Boolean(
    search || activeStage || businessTypeFilter || customerStatusFilter || leadStageFilter
  );

  function resetFilters() {
    setSearchInput("");
    navigate({ search: "", stage: "", businessType: "", customerStatus: "", leadStage: "", page: 1 });
  }

  async function handleDelete(lead: LeadRow) {
    if (!confirm(`Delete ${lead.name ?? lead.phone}? This can't be undone.`))
      return;
    setDeletingId(lead.id);
    try {
      const res = await fetch(`/api/contacts/${lead.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete lead");
      }
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete lead");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (activeStage) params.set("stage", activeStage);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      if (customerStatusFilter) params.set("customerStatus", customerStatusFilter);
      if (leadStageFilter) params.set("leadStage", leadStageFilter);
      const res = await fetch(`/api/contacts/export${params.toString() ? `?${params.toString()}` : ""}`);
      if (!res.ok) throw new Error("Could not export leads");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leads-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not export leads");
    } finally {
      setExporting(false);
    }
  }

  function toEditable(lead: LeadRow): EditableLead {
    return {
      id: lead.id,
      name: lead.name ?? "",
      phone: lead.phone,
      businessType: lead.businessType ?? "",
      city: lead.city ?? "",
      stage: lead.stage,
      customerStatusId: lead.customerStatus?.id ?? null,
      leadStageId: lead.leadStage?.id ?? null,
      tagIds: lead.tags.map((t) => t.id),
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Leads</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {totalLeads.toLocaleString("en-IN")} lead{totalLeads === 1 ? "" : "s"} total
            {newLeadsCount > 0 ? ` · ${newLeadsCount.toLocaleString("en-IN")} new` : ""}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer disabled:opacity-50 shrink-0"
        >
          {exporting ? "Preparing…" : "Download all leads"}
        </button>
      </div>

      {/* Centered search — the primary way to find a lead */}
      <div className="flex justify-center mb-4">
        <div className="relative w-full max-w-lg">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="w-full rounded-full border border-stone-300 bg-white pl-10 pr-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Field filters + reset */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <select
          value={activeStage ?? ""}
          onChange={(e) => updateFilter({ stage: e.target.value })}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {businessTypes.length > 0 && (
          <select
            value={businessTypeFilter}
            onChange={(e) => updateFilter({ businessType: e.target.value })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All business types</option>
            {businessTypes.map((bt) => (
              <option key={bt.id} value={bt.name}>
                {bt.name}
              </option>
            ))}
          </select>
        )}

        {customerStatuses.length > 0 && (
          <select
            value={customerStatusFilter}
            onChange={(e) => updateFilter({ customerStatus: e.target.value })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All customer statuses</option>
            {customerStatuses.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.name}
              </option>
            ))}
          </select>
        )}

        {leadStages.length > 0 && (
          <select
            value={leadStageFilter}
            onChange={(e) => updateFilter({ leadStage: e.target.value })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All lead stages</option>
            {leadStages.map((ls) => (
              <option key={ls.id} value={ls.id}>
                {ls.name}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="rounded-lg border border-stone-300 text-stone-500 text-sm px-3 py-1.5 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mb-5">
        {canManageTaxonomy && (
          <button
            onClick={() => setModal({ type: "taxonomy" })}
            className="rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
          >
            Manage statuses &amp; stages
          </button>
        )}
        <button
          onClick={() => setModal({ type: "tags" })}
          className="rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
        >
          Manage tags
        </button>
        <button
          onClick={() => setModal({ type: "import" })}
          className="rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer"
        >
          Import
        </button>
        <button
          onClick={() => setModal({ type: "add" })}
          className="rounded-lg bg-stone-900 text-white text-sm px-3 py-1.5 hover:bg-stone-800 cursor-pointer"
        >
          + Add lead
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-2xl mx-auto">
          <p className="text-stone-700 font-medium">No leads found</p>
          <p className="text-sm text-stone-500 mt-1">
            {hasActiveFilters
              ? "Try a different search or filter."
              : "Add a lead or import a file to get started."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {/* Below sm: a stacked card per lead — a table this wide (min-w-[1100px]
              below) forces horizontal scrolling on a phone, and a row's height
              is set by its tallest cell even when that cell is scrolled out of
              view, so a lead with a few tags can leave a tall blank-looking row. */}
          <div className="sm:hidden divide-y divide-stone-100">
            {leads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => setModal({ type: "view", leadId: lead.id })}
                className="p-4 cursor-pointer hover:bg-stone-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-stone-900 font-medium">{lead.name ?? "—"}</span>
                  <StageBadge stage={lead.stage} />
                </div>
                <div className="mt-1.5 text-xs text-stone-500 space-y-0.5">
                  {(lead.businessType || lead.city || lead.region) && (
                    <p>
                      {[lead.businessType, [lead.city, lead.region].filter(Boolean).join(" / ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {(lead.customerStatus || lead.leadStage) && (
                    <p>
                      {[lead.customerStatus?.name, lead.leadStage?.name].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p>
                    Added{" "}
                    {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                {lead.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {lead.tags.map((t) => (
                      <span
                        key={t.id}
                        className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className="flex items-center gap-3 mt-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setModal({ type: "edit", lead })}
                    className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    disabled={deletingId === lead.id}
                    onClick={() => handleDelete(lead)}
                    className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === lead.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Business type</th>
                <th className="px-4 py-3 font-medium">City / Region</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Customer status</th>
                <th className="px-4 py-3 font-medium">Lead stage</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setModal({ type: "view", leadId: lead.id })}
                  className="border-b border-stone-100 last:border-0 cursor-pointer hover:bg-stone-50"
                >
                  <td className="px-4 py-3 text-stone-900 hover:text-amber-600">
                    {lead.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {lead.businessType ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {[lead.city, lead.region].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{lead.product ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={lead.stage} />
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {lead.customerStatus?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {lead.leadStage?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                    {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setModal({ type: "edit", lead })}
                        className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        disabled={deletingId === lead.id}
                        onClick={() => handleDelete(lead)}
                        className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === lead.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-stone-200 text-sm">
            <span className="text-stone-500">
              Showing {rangeStart.toLocaleString("en-IN")}–{rangeEnd.toLocaleString("en-IN")} of{" "}
              {filteredCount.toLocaleString("en-IN")} lead{filteredCount === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate({ page: page - 1 })}
                disabled={page <= 1}
                className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-default cursor-pointer"
              >
                Previous
              </button>
              <span className="text-stone-500">
                Page {page} of {pageCount}
              </span>
              <button
                onClick={() => navigate({ page: page + 1 })}
                disabled={page >= pageCount}
                className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-default cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "add" && (
        <LeadModal
          businessTypes={businessTypes}
          customerStatuses={customerStatuses}
          leadStages={leadStages}
          allTags={allTags}
          onClose={() => setModal(null)}
          onSaved={closeAndRefresh}
        />
      )}

      {modal?.type === "edit" && (
        <LeadModal
          lead={toEditable(modal.lead)}
          businessTypes={businessTypes}
          customerStatuses={customerStatuses}
          leadStages={leadStages}
          allTags={allTags}
          onClose={() => setModal(null)}
          onSaved={closeAndRefresh}
        />
      )}

      {modal?.type === "view" && (
        <LeadDetailModal
          leadId={modal.leadId}
          onClose={() => setModal(null)}
          onEdit={() => {
            const lead = leads.find((l) => l.id === modal.leadId);
            if (lead) setModal({ type: "edit", lead });
          }}
        />
      )}

      {modal?.type === "import" && (
        <ImportModal onClose={() => setModal(null)} onImported={refresh} />
      )}

      {modal?.type === "tags" && (
        <TagManagerModal
          tags={allTags}
          onClose={() => setModal(null)}
          onChanged={refresh}
        />
      )}

      {modal?.type === "taxonomy" && (
        <TaxonomyManagerModal
          customerStatuses={customerStatuses}
          leadStages={leadStages}
          onClose={() => setModal(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
