// Shared by the Imports wizard and the Campaigns "upload a list" flow —
// both offer the same "download a sample CSV" starting point. Browser-only
// (Blob/URL/document), safe to import from any client component.
export function downloadSampleLeadsCsv(filename = "leads-template.csv") {
  const headers = [
    "Mobile No",
    "Customer Name",
    "Business Type",
    "City",
    "Last Order Date",
    "Monthly Order Value",
  ];
  const example = [
    "9876543210",
    "Example Traders",
    "Retail",
    "Pune",
    "2026-06-15",
    "45000",
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
