// One-time migration: rewrite every row's primary key (and every column
// that references it) from the old cuid format to a real ULID, in place.
//
// Why this exists as a standalone script rather than a `prisma migrate`
// SQL file: schema.prisma's `@default(cuid())` -> `@default(ulid())`
// change is a pure client-side/query-engine generation strategy with zero
// DDL (confirmed via `prisma migrate diff`, which reports an empty
// migration for that change) — it only affects IDs generated from now on.
// Rewriting the ids of rows that already exist is a data migration with
// per-row, dynamically-generated values, which `prisma migrate deploy`
// isn't built for. This mirrors this project's existing pattern for
// prisma/seed.prod.ts and prisma/reset-prod-data.ts: a manual script, run
// once, gated behind an explicit confirmation env var.
//
// How it works:
//   1. Introspect every real foreign-key constraint from Postgres itself
//      (pg_constraint) — not hardcoded — and drop them all.
//   2. Find every table whose primary key is a single column named "id"
//      (this naturally excludes ContactTag, whose PK is the
//      [contactId, tagId] pair) and generate a fresh ULID for every row.
//   3. Use those same per-table old-id -> new-id maps to rewrite every FK
//      column discovered in step 1, plus three columns that reference
//      another table's id WITHOUT a declared Prisma relation/DB constraint
//      (checked directly against schema.prisma, not guessed):
//        - SequenceInstance.pivotedToId -> SequenceInstance.id
//        - Message.instanceId           -> SequenceInstance.id
//        - ScheduledCampaign.ranCampaignId -> Campaign.id
//      (Workflow.definition's JSON step data references templates/
//      subflows by NAME, not id — see core/workflow/schema.ts's SendStep
//      and engine.ts's pivot() — so no JSON surgery is needed anywhere.)
//   4. Re-create every FK constraint dropped in step 1 from its exact
//      original definition (pg_get_constraintdef), and verify no orphaned
//      reference exists anywhere before committing.
//   5. Everything happens in ONE transaction — any failure rolls back the
//      entire thing, leaving the database exactly as it was.
//
// Already-ULID rows are left untouched (checked per table), so running
// this twice is safe and the second run does nothing.
//
// This assumes a dataset small enough for a single transaction (true for
// this project today — two real tenants, a handful of rows each). It is
// NOT written to migrate a 700k+ row table; that would need batched,
// non-transactional chunking instead.
//
// Usage:
//   CONFIRM_ULID_MIGRATION=yes-migrate-ids-to-ulid npx tsx -r dotenv/config prisma/migrate-ids-to-ulid.ts
//
// Take a real backup first. See docs/RUNBOOK.md.

import { Client } from "pg";
import { ulid } from "ulid";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// [table, column, referencedTable] for real references that exist only as
// plain string columns in schema.prisma, never declared as a Prisma
// `@relation` (so pg_constraint has no FK row for them at all).
const MANUAL_SOFT_REFERENCES: [string, string, string][] = [
  ["SequenceInstance", "pivotedToId", "SequenceInstance"],
  ["Message", "instanceId", "SequenceInstance"],
  ["ScheduledCampaign", "ranCampaignId", "Campaign"],
];

// Every model in schema.prisma with its own single-column "id" primary
// key, as of when this script was written — every other model (or an
// unexpected system table) showing up in the introspected list below
// means the schema changed or something is off; the script refuses to
// guess and stops instead of silently remapping a table it doesn't know
// about (this caught _prisma_migrations on the first real run).
const EXPECTED_ID_PK_TABLES = [
  "Account",
  "ApiKey",
  "BusinessType",
  "Campaign",
  "Contact",
  "CustomerStatus",
  "Event",
  "Import",
  "LeadStage",
  "Link",
  "Message",
  "MessageTemplate",
  "PasswordResetToken",
  "Role",
  "RolePermission",
  "ScheduledCampaign",
  "SequenceInstance",
  "Service",
  "Tag",
  "TagRule",
  "Tenant",
  "User",
  "Workflow",
].sort();

type FkConstraint = {
  constraintName: string;
  tableName: string;
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
};

async function getForeignKeyConstraints(client: Client): Promise<FkConstraint[]> {
  const { rows } = await client.query(`
    SELECT
      con.conname AS "constraintName",
      rel.relname AS "tableName",
      att.attname AS "columnName",
      frel.relname AS "foreignTableName",
      fatt.attname AS "foreignColumnName",
      con.oid::text AS "oid"
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_class frel ON frel.oid = con.confrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS cfk(attnum, ord) ON cfk.ord = ck.ord
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
    JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = cfk.attnum
    WHERE con.contype = 'f' AND nsp.nspname = 'public'
    ORDER BY rel.relname, con.conname, ck.ord
  `);

  // Group by constraint name to detect (and refuse) any multi-column FK —
  // none are expected in this schema (every @relation here is single-
  // column), so this is a safety trip-wire, not normal handling.
  const byConstraint = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byConstraint.get(row.constraintName) ?? [];
    list.push(row);
    byConstraint.set(row.constraintName, list);
  }
  const result: FkConstraint[] = [];
  for (const [name, group] of byConstraint) {
    if (group.length !== 1) {
      throw new Error(
        `Constraint "${name}" is a multi-column foreign key — this script only supports single-column FKs. Aborting before any changes.`
      );
    }
    const r = group[0];
    result.push({
      constraintName: r.constraintName,
      tableName: r.tableName,
      columnName: r.columnName,
      foreignTableName: r.foreignTableName,
      foreignColumnName: r.foreignColumnName,
    });
  }
  return result;
}

async function getConstraintDefinitions(
  client: Client,
  constraintNames: string[]
): Promise<Map<string, { tableName: string; definition: string }>> {
  if (constraintNames.length === 0) return new Map();
  const { rows } = await client.query(
    `
    SELECT con.conname AS "constraintName", rel.relname AS "tableName", pg_get_constraintdef(con.oid) AS "definition"
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.conname = ANY($1::text[])
    `,
    [constraintNames]
  );
  const map = new Map<string, { tableName: string; definition: string }>();
  for (const row of rows) {
    map.set(row.constraintName, { tableName: row.tableName, definition: row.definition });
  }
  return map;
}

// Tables whose primary key is exactly one column named "id" — excludes
// ContactTag, whose PK is the composite [contactId, tagId], and Prisma's
// own internal _prisma_migrations bookkeeping table, which happens to
// also have a column named "id" but is not application data and must
// never be touched.
async function getIdPkTables(client: Client): Promise<string[]> {
  const { rows } = await client.query(`
    SELECT tc.table_name AS "tableName"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      AND tc.table_name NOT LIKE '\\_prisma%'
    GROUP BY tc.table_name
    HAVING COUNT(*) = 1 AND MAX(kcu.column_name) = 'id'
    ORDER BY tc.table_name
  `);
  return rows.map((r) => r.tableName);
}

async function buildIdMap(client: Client, table: string): Promise<Map<string, string>> {
  const { rows } = await client.query(`SELECT id FROM "${table}"`);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (ULID_RE.test(row.id)) continue; // already a ULID — idempotency guard
    map.set(row.id, ulid());
  }
  return map;
}

const BATCH_SIZE = 200;

async function remapColumn(
  client: Client,
  table: string,
  column: string,
  idMap: Map<string, string>
): Promise<number> {
  if (idMap.size === 0) return 0;
  const entries = [...idMap.entries()];
  let updated = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const values = batch.map((_, j) => `($${j * 2 + 1}::text, $${j * 2 + 2}::text)`).join(",");
    const params = batch.flatMap(([oldId, newId]) => [oldId, newId]);
    const res = await client.query(
      `UPDATE "${table}" AS t SET "${column}" = v.new_id FROM (VALUES ${values}) AS v(old_id, new_id) WHERE t."${column}" = v.old_id`,
      params
    );
    updated += res.rowCount ?? 0;
  }
  return updated;
}

async function main() {
  if (process.env.CONFIRM_ULID_MIGRATION !== "yes-migrate-ids-to-ulid") {
    console.error(
      "Refusing to run: set CONFIRM_ULID_MIGRATION=yes-migrate-ids-to-ulid to confirm. Take a real backup first (see docs/RUNBOOK.md)."
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    console.log("Introspecting foreign key constraints...");
    const fks = await getForeignKeyConstraints(client);
    const defs = await getConstraintDefinitions(client, fks.map((f) => f.constraintName));
    console.log(`Found ${fks.length} foreign key constraints.`);

    console.log("Dropping foreign key constraints...");
    for (const fk of fks) {
      await client.query(`ALTER TABLE "${fk.tableName}" DROP CONSTRAINT "${fk.constraintName}"`);
    }

    console.log("Finding tables with a single-column id primary key...");
    const tables = await getIdPkTables(client);
    console.log(`Found ${tables.length} tables: ${tables.join(", ")}`);
    const sortedTables = [...tables].sort();
    if (
      sortedTables.length !== EXPECTED_ID_PK_TABLES.length ||
      sortedTables.some((t, i) => t !== EXPECTED_ID_PK_TABLES[i])
    ) {
      throw new Error(
        `Table list doesn't match what this script expects.\nExpected: ${EXPECTED_ID_PK_TABLES.join(", ")}\nFound:    ${sortedTables.join(", ")}\nUpdate EXPECTED_ID_PK_TABLES (and check for a schema change) before re-running.`
      );
    }

    console.log("Generating new ULIDs and remapping primary keys...");
    const idMaps = new Map<string, Map<string, string>>();
    for (const table of tables) {
      const map = await buildIdMap(client, table);
      idMaps.set(table, map);
      if (map.size === 0) {
        console.log(`  ${table}: already migrated, skipping`);
        continue;
      }
      const updated = await remapColumn(client, table, "id", map);
      console.log(`  ${table}: ${updated} row(s) remapped`);
    }

    console.log("Remapping foreign key columns...");
    for (const fk of fks) {
      const map = idMaps.get(fk.foreignTableName);
      if (!map || map.size === 0) continue;
      const updated = await remapColumn(client, fk.tableName, fk.columnName, map);
      if (updated > 0) {
        console.log(`  ${fk.tableName}.${fk.columnName} -> ${fk.foreignTableName}.id: ${updated} row(s)`);
      }
    }

    console.log("Remapping soft (undeclared) references...");
    for (const [table, column, foreignTable] of MANUAL_SOFT_REFERENCES) {
      const map = idMaps.get(foreignTable);
      if (!map || map.size === 0) continue;
      const updated = await remapColumn(client, table, column, map);
      if (updated > 0) {
        console.log(`  ${table}.${column} -> ${foreignTable}.id: ${updated} row(s)`);
      }
    }

    console.log("Re-creating foreign key constraints...");
    for (const fk of fks) {
      const def = defs.get(fk.constraintName);
      if (!def) throw new Error(`Missing captured definition for constraint "${fk.constraintName}"`);
      await client.query(`ALTER TABLE "${def.tableName}" ADD CONSTRAINT "${fk.constraintName}" ${def.definition}`);
    }

    console.log("Verifying referential integrity...");
    for (const fk of fks) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS "orphans" FROM "${fk.tableName}" WHERE "${fk.columnName}" IS NOT NULL AND "${fk.columnName}" NOT IN (SELECT "${fk.foreignColumnName}" FROM "${fk.foreignTableName}")`
      );
      if (rows[0].orphans > 0) {
        throw new Error(
          `Integrity check failed: ${fk.tableName}.${fk.columnName} has ${rows[0].orphans} orphaned reference(s) to ${fk.foreignTableName}.${fk.foreignColumnName}`
        );
      }
    }
    for (const [table, column, foreignTable] of MANUAL_SOFT_REFERENCES) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS "orphans" FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" NOT IN (SELECT id FROM "${foreignTable}")`
      );
      if (rows[0].orphans > 0) {
        throw new Error(
          `Integrity check failed: ${table}.${column} has ${rows[0].orphans} orphaned reference(s) to ${foreignTable}.id`
        );
      }
    }
    console.log("Integrity check passed — no orphaned references.");

    await client.query("COMMIT");
    console.log("Done. All ids are now ULIDs.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back. Database is unchanged.");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
