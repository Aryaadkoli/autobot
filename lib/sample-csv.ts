// Browser-only (Blob/URL/document) — safe to import from any client component.
// Columns match the ops team's full ingestion field list (Partner/Business/
// contact/location/product/opportunity fields, plus the Customer Status /
// Lead Stage taxonomy — see lib/lead-stages.ts). Anything without a
// dedicated Contact field lands in attributes.<slug> on import, same as any
// other unmapped column. Headers only, deliberately no example row — this
// is the format to fill in and upload, not a demo file.
export function downloadLeadsTemplateCsv(filename = "leads-upload-format.csv") {
  const headers = [
    "Partner Name",
    "Business",
    "Name",
    "Address",
    "Locality",
    "City",
    "District",
    "Zone",
    "State",
    "Pin Code",
    "Phone No.",
    "Product",
    "Latitude",
    "Longitude",
    "Opportunity",
    "Revenue",
    "Region",
    "Customer",
    "Maintenance",
    "Customer Status",
    "Lead Stage",
    "Flags",
    "Notes",
  ];
  const csv = headers.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
