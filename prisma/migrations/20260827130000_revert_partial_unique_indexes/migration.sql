-- Correction: the previous migration made these five uniqueness
-- constraints partial (unique only among non-deleted rows), matching
-- schema.prisma's plain @@unique only in the client's generated types,
-- not in what Postgres actually enforces. That mismatch breaks every
-- .upsert() on these models at runtime — Postgres refuses to match an
-- `ON CONFLICT (col, col)` clause (what Prisma always generates) against
-- a partial index unless the INSERT itself repeats the same WHERE
-- predicate, which Prisma has no way to know to add. Confirmed live:
-- prisma.user.upsert() failed with "no unique or exclusion constraint
-- matching the ON CONFLICT specification" the moment this was tested for
-- real, rather than just type-checked.
--
-- Fix: go back to plain unique constraints, matching schema.prisma
-- exactly (no more declared-vs-real mismatch, no more "never run
-- `prisma migrate dev`" caveat either). The real cost: a soft-deleted
-- row's key (a contact's phone, a tag's name, a teammate's tenant
-- membership) stays reserved until that row is genuinely cleaned up —
-- it can no longer be reused immediately by a new row. Where that
-- matters in practice, the app resurrects the old row instead of
-- creating a new one (see core/ingestion/upsert.ts for contacts/tags,
-- and app/api/roles/route.ts for roles).

DROP INDEX "Contact_tenantId_phone_key";
CREATE UNIQUE INDEX "Contact_tenantId_phone_key" ON "Contact"("tenantId", "phone");

DROP INDEX "Tag_tenantId_name_key";
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

DROP INDEX "MessageTemplate_tenantId_name_key";
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_key" ON "MessageTemplate"("tenantId", "name");

DROP INDEX "Workflow_tenantId_name_version_key";
CREATE UNIQUE INDEX "Workflow_tenantId_name_version_key" ON "Workflow"("tenantId", "name", "version");

DROP INDEX "User_tenantId_accountId_key";
CREATE UNIQUE INDEX "User_tenantId_accountId_key" ON "User"("tenantId", "accountId");

DROP INDEX "Role_tenantId_name_key";
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");
