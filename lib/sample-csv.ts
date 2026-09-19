// Browser-only (Blob/URL/document) — safe to import from any client component.
// Columns match the ops team's full ingestion field list (Partner/Business/
// contact/location/product/opportunity fields, plus the Customer Status /
// Lead Stage taxonomy — see lib/lead-stages.ts). Anything without a
// dedicated Contact field lands in attributes.<slug> on import, same as any
// other unmapped column.
export function downloadSampleLeadsCsv(filename = "leads-template.csv") {
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
  const example = [
    "Ramesh Traders",
    "Agriculture",
    "Ramesh Gowda",
    "12 MG Road",
    "Whitefield",
    "Bengaluru",
    "Bengaluru Urban",
    "South",
    "Karnataka",
    "560066",
    "9876543210",
    "Areca",
    "12.9716",
    "77.5946",
    "500000",
    "50000",
    "South India",
    "Yes",
    "No",
    "Customer Acquisition Stages",
    "Lead",
    "",
    "Interested in bulk order",
  ];
  const csv = [headers, example]
    .map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
