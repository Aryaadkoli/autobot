"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Mascot from "@/components/mascot";
import { STAGES } from "./stages";
import StageBadge from "./stage-badge";
import LeadModal, { type EditableLead } from "./lead-modal";
import ImportModal from "./import-modal";
import TagManagerModal from "./tag-manager-modal";
import LeadDetailModal from "./lead-detail-modal";
import TaxonomyManagerModal from "./taxonomy-manager-modal";

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

const PAGE_SIZE = 30;

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
  totalLeads: number;
  newLeadsCount: number;
  openNewOnLoad?: boolean;
  openImportOnLoad?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(activeStage ?? "");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("");
  const [customerStatusFilter, setCustomerStatusFilter] = useState("");
  const [leadStageFilter, setLeadStageFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(() => {
    if (openImportOnLoad) return { type: "import" };
    if (openNewOnLoad) return { type: "add" };
    return null;
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (openImportOnLoad || openNewOnLoad) {
      router.replace("/contacts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    router.refresh();
  }

  function closeAndRefresh() {
    setModal(null);
    refresh();
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

  const hasActiveFilters = Boolean(
    search.trim() || stageFilter || businessTypeFilter || customerStatusFilter || leadStageFilter
  );

  function resetFilters() {
    setSearch("");
    setStageFilter("");
    setBusinessTypeFilter("");
    setCustomerStatusFilter("");
    setLeadStageFilter("");
    setPage(1);
  }

  const filtered = leads.filter((l) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !(
          (l.name ?? "").toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q)
        )
      ) {
        return false;
      }
    }
    if (stageFilter && l.stage !== stageFilter) return false;
    if (businessTypeFilter && l.businessType !== businessTypeFilter) return false;
    if (customerStatusFilter && l.customerStatus?.id !== customerStatusFilter) return false;
    if (leadStageFilter && l.leadStage?.id !== leadStageFilter) return false;
    return true;
  });

  // Derived during render rather than reset via an effect: clamping here
  // means loosening/tightening a filter can never leave `page` pointing
  // past the end of the now-different result set, without needing to
  // watch every filter as a dependency just to reset one piece of state.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-stone-900 px-8 py-7">
        <div
          className="pointer-events-none absolute inset-0 [animation:glow-breathe_6s_ease-in-out_infinite]"
          style={{
            background:
              "radial-gradient(circle at 85% 20%, rgba(251,191,36,0.16), transparent 55%)",
          }}
        />
        <button
          onClick={() => setModal({ type: "add" })}
          title="Click to add a lead"
          className="absolute -right-2 -top-4 opacity-90 cursor-pointer transition-transform hover:scale-105"
        >
          <Mascot />
        </button>
        <div className="relative max-w-[60%]">
          <h1 className="text-xl font-medium text-white">
            {newLeadsCount > 0
              ? `${newLeadsCount} new lead${newLeadsCount === 1 ? "" : "s"} waiting for a first touch`
              : "All leads have been contacted — nice work"}
          </h1>
          <p className="mt-1.5 text-sm text-stone-400">
            {totalLeads} lead{totalLeads === 1 ? "" : "s"} total. Add, import,
            and follow up — all from right here.
          </p>
        </div>
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
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or phone…"
            className="w-full rounded-full border border-stone-300 bg-white pl-10 pr-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Field filters + reset */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <select
          value={stageFilter}
          onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
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
            onChange={(e) => { setBusinessTypeFilter(e.target.value); setPage(1); }}
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
            onChange={(e) => { setCustomerStatusFilter(e.target.value); setPage(1); }}
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
            onChange={(e) => { setLeadStageFilter(e.target.value); setPage(1); }}
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

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-2xl">
          <p className="text-stone-700 font-medium">No leads found</p>
          <p className="text-sm text-stone-500 mt-1">
            {search
              ? "Try a different search."
              : activeStage
                ? "No leads match this stage."
                : "Add a lead or import a file to get started."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
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
              {paginated.map((lead) => (
                <tr key={lead.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setModal({ type: "view", leadId: lead.id })}
                      className="text-stone-900 hover:text-amber-600 hover:underline cursor-pointer"
                    >
                      {lead.name ?? "—"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{lead.phone}</td>
                  <td className="px-4 py-3 text-stone-600">{lead.email ?? "—"}</td>
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
                  <td className="px-4 py-3">
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

          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 text-sm">
              <span className="text-stone-500">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-stone-500">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage === pageCount}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
