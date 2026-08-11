"use client";

import { slugifyHeader } from "@/core/ingestion/mapper";

// Shared by the Imports wizard and the Campaigns "upload a list" flow —
// both need the same "which column is phone/name/..." mapping step.
export default function ColumnMappingTable({
  headers,
  sampleRow,
  mapping,
  onChange,
}: {
  headers: string[];
  sampleRow: Record<string, unknown>;
  mapping: Record<string, string>;
  onChange: (header: string, value: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-left text-stone-500 border-b border-stone-200">
            <th className="px-3 py-2 font-medium">Column</th>
            <th className="px-3 py-2 font-medium">Sample</th>
            <th className="px-3 py-2 font-medium">Maps to</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header) => {
            const attrValue = `attributes.${slugifyHeader(header)}`;
            return (
              <tr key={header} className="border-b border-stone-100 last:border-0">
                <td className="px-3 py-2 text-stone-900">{header}</td>
                <td className="px-3 py-2 text-stone-500 truncate max-w-[160px]">
                  {String(sampleRow?.[header] ?? "—")}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={mapping[header] ?? "skip"}
                    onChange={(e) => onChange(header, e.target.value)}
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                  >
                    <option value="skip">Skip</option>
                    <option value="phone">Phone</option>
                    <option value="name">Name</option>
                    <option value="businessType">Business type</option>
                    <option value={attrValue}>
                      Attribute: {slugifyHeader(header)}
                    </option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
