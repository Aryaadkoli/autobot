import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/phone";
import { evaluateCondition, type ConditionNode } from "../tagging/rules";
import { mapRow, type ColumnMapping } from "./mapper";

export type ImportRowError = { row: number; error: string };

export type ImportResult = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errorReport: ImportRowError[];
  taggedCounts: Record<string, number>;
  // Deduped — a file with the same phone on two rows still only appears
  // once here, since both rows upsert to the same Contact.
  contactIds: string[];
};

// Dedupes on (tenantId, phone), upserts each row into a Contact, emits an
// IMPORTED/UPDATED Event, and applies any active INGEST TagRules. Bad rows
// are recorded in errorReport, never thrown — a messy Excel file must not
// abort the whole import.
export async function importContacts({
  tenantId,
  rows,
  columnMapping,
  tagName,
}: {
  tenantId: string;
  rows: Record<string, unknown>[];
  columnMapping: ColumnMapping;
  tagName?: string;
}): Promise<ImportResult> {
  const businessTypeCache = new Map<string, string>();
  const errorReport: ImportRowError[] = [];
  const taggedCounts: Record<string, number> = {};
  const contactIds = new Set<string>();
  let importedRows = 0;

  // update: { deletedAt: null } for the same reason as the contact
  // upsert below — upsert's `where` isn't soft-delete-filtered, so
  // reusing a previously-deleted tag's name here must resurrect it,
  // not silently update a hidden row.
  const bulkTag = tagName
    ? await prisma.tag.upsert({
        where: { tenantId_name: { tenantId, name: tagName } },
        update: { deletedAt: null },
        create: { tenantId, name: tagName },
      })
    : null;

  const activeRules = await prisma.tagRule.findMany({
    where: { tenantId, active: true, runOn: { in: ["INGEST", "BOTH"] } },
    include: { tag: true },
  });

  for (let i = 0; i < rows.length; i++) {
    try {
      const mapped = mapRow(rows[i], columnMapping);
      if (!mapped.phone) throw new Error("Missing phone number");

      const phone = normalizePhone(mapped.phone);
      if (!phone) throw new Error(`Invalid phone number: ${mapped.phone}`);

      let businessTypeId: string | undefined;
      if (mapped.businessType) {
        const cached = businessTypeCache.get(mapped.businessType);
        if (cached) {
          businessTypeId = cached;
        } else {
          const bt = await prisma.businessType.upsert({
            where: { tenantId_name: { tenantId, name: mapped.businessType } },
            update: {},
            create: { tenantId, name: mapped.businessType },
          });
          businessTypeCache.set(mapped.businessType, bt.id);
          businessTypeId = bt.id;
        }
      }

      const existing = await prisma.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone } },
      });

      const mergedAttributes = {
        ...((existing?.attributes as Record<string, unknown>) ?? {}),
        ...mapped.attributes,
      };

      // upsert's `where` matches by (tenantId, phone) regardless of
      // deletedAt (only findMany/findFirst/count are soft-delete-filtered
      // — see lib/db.ts), so re-importing a phone number that belongs to
      // a previously-deleted contact hits the `update` branch on that
      // deleted row. Clearing deletedAt here is deliberate: bringing a
      // contact back via a real re-import is exactly what should
      // resurrect it, rather than leaving it updated-but-still-hidden.
      const contact = await prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: {
          ...(mapped.name ? { name: mapped.name } : {}),
          ...(businessTypeId ? { businessTypeId } : {}),
          attributes: mergedAttributes as Prisma.InputJsonValue,
          deletedAt: null,
        },
        create: {
          tenantId,
          phone,
          name: mapped.name,
          businessTypeId,
          attributes: mergedAttributes as Prisma.InputJsonValue,
        },
      });

      await prisma.event.create({
        data: {
          tenantId,
          contactId: contact.id,
          type: existing ? "UPDATED" : "IMPORTED",
        },
      });

      if (bulkTag) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: bulkTag.id } },
          update: {},
          create: { contactId: contact.id, tagId: bulkTag.id },
        });
      }

      for (const rule of activeRules) {
        const condition = rule.condition as unknown as ConditionNode;
        if (evaluateCondition(condition, mergedAttributes)) {
          await prisma.contactTag.upsert({
            where: {
              contactId_tagId: { contactId: contact.id, tagId: rule.tagId },
            },
            update: {},
            create: { contactId: contact.id, tagId: rule.tagId },
          });
          taggedCounts[rule.tag.name] = (taggedCounts[rule.tag.name] ?? 0) + 1;
        }
      }

      contactIds.add(contact.id);
      importedRows++;
    } catch (e) {
      errorReport.push({
        row: i + 1,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: errorReport.length,
    errorReport,
    taggedCounts,
    contactIds: [...contactIds],
  };
}
