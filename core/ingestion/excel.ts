import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

const MAX_ROWS = 5000;

// Parses an uploaded .xlsx/.csv buffer into a header row + record rows.
// Framework-free: no Next.js imports, safe to reuse from the worker later.
export function parseWorkbook(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const headers = rows.length
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]) ?? [];

  return { headers, rows: rows.slice(0, MAX_ROWS) };
}
