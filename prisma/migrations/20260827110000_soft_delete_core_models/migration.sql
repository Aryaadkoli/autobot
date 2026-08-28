-- Soft delete for the four editable content models plus team membership.
-- "Delete" no longer removes the row (lib/db.ts's Prisma Client Extension
-- rewrites every .delete()/.deleteMany() call on these models into an
-- update that just sets deletedAt) — this migration is the DB side of
-- that: add the column, and convert each model's uniqueness constraint
-- into a *partial* index that only applies among non-deleted rows, so a
-- deleted contact's phone number / a deleted tag's name / etc. becomes
-- reusable again instead of permanently blocking a real re-add.
-- (Partial indexes aren't expressible via `@@unique` in schema.prisma —
-- see the comments on these fields there.)
--
-- ADD COLUMN uses IF NOT EXISTS because this migration previously failed
-- partway through on a real run (Prisma applies each statement
-- individually rather than as one transaction, so the columns below had
-- already committed before the DROP CONSTRAINT calls further down failed
-- — they were targeting plain indexes, not table constraints).

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

DROP INDEX "Contact_tenantId_phone_key";
CREATE UNIQUE INDEX "Contact_tenantId_phone_key" ON "Contact"("tenantId", "phone") WHERE "deletedAt" IS NULL;

DROP INDEX "Tag_tenantId_name_key";
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name") WHERE "deletedAt" IS NULL;

DROP INDEX "MessageTemplate_tenantId_name_key";
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_key" ON "MessageTemplate"("tenantId", "name") WHERE "deletedAt" IS NULL;

DROP INDEX "Workflow_tenantId_name_version_key";
CREATE UNIQUE INDEX "Workflow_tenantId_name_version_key" ON "Workflow"("tenantId", "name", "version") WHERE "deletedAt" IS NULL;

DROP INDEX "User_tenantId_accountId_key";
CREATE UNIQUE INDEX "User_tenantId_accountId_key" ON "User"("tenantId", "accountId") WHERE "deletedAt" IS NULL;

-- Role already had a deletedAt column and soft-delete behavior (added
-- last session), but its uniqueness constraint was a plain (non-partial)
-- unique index — a bug: it silently blocked recreating a role with the
-- same name as one you'd already soft-deleted. Fixing that here.
DROP INDEX "Role_tenantId_name_key";
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name") WHERE "deletedAt" IS NULL;
