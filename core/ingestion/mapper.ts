// columnMapping values follow the convention from docs/BLUEPRINT.md:
// "phone" | "name" | "businessType" | "skip" | "attributes.<key>"
export type ColumnMapping = Record<string, string>;

export type MappedContact = {
  phone: string | null;
  name: string | null;
  businessType: string | null;
  attributes: Record<string, unknown>;
};

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function mapRow(
  row: Record<string, unknown>,
  columnMapping: ColumnMapping
): MappedContact {
  const attributes: Record<string, unknown> = {};
  let phone: string | null = null;
  let name: string | null = null;
  let businessType: string | null = null;

  for (const [header, target] of Object.entries(columnMapping)) {
    const value = toStringValue(row[header]);
    if (!target || target === "skip" || !value) continue;

    if (target === "phone") phone = value.slice(0, 32);
    else if (target === "name") name = value.slice(0, 200);
    else if (target === "businessType") businessType = value.slice(0, 100);
    else if (target.startsWith("attributes.")) {
      attributes[target.slice("attributes.".length)] = value.slice(0, 500);
    }
  }

  return { phone, name, businessType, attributes };
}

export function slugifyHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Best-effort auto-mapping so the import wizard starts pre-filled.
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const key = header.toLowerCase();
    if (/phone|mobile|contact\s*no|whatsapp/.test(key)) {
      mapping[header] = "phone";
    } else if (/^name$|customer\s*name|full\s*name|contact\s*name/.test(key)) {
      mapping[header] = "name";
    } else if (/business\s*type|category|segment/.test(key)) {
      mapping[header] = "businessType";
    } else {
      const slug = slugifyHeader(header);
      mapping[header] = slug ? `attributes.${slug}` : "skip";
    }
  }
  return mapping;
}
