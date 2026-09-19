-- Reverse migration for 20260919101407_add_customer_status_lead_stage.
--
-- Prisma has no built-in "migrate down" — this is a hand-written companion
-- script, run manually if this migration needs rolling back on prod:
--
--   docker compose exec web npx prisma db execute \
--     --file prisma/migrations/20260919101407_add_customer_status_lead_stage/down.sql \
--     --schema prisma/schema.prisma
--
-- (run against the `worker` container instead if `web` lacks the tooling —
-- see CLAUDE.md's EACCES note on the trimmed web image.)
--
-- This only undoes the schema change: drops the Contact.customerStatusId/
-- leadStageId columns and the CustomerStatus/LeadStage tables entirely. Any
-- Customer Status / Lead Stage data already assigned to contacts is lost —
-- confirm that's acceptable before running this. After running it, also
-- revert the app code (this migration's commit) before restarting the
-- containers, since the running app otherwise expects these columns/tables
-- to exist.

ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_customerStatusId_fkey";
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_leadStageId_fkey";

DROP INDEX IF EXISTS "Contact_tenantId_customerStatusId_idx";
DROP INDEX IF EXISTS "Contact_tenantId_leadStageId_idx";

ALTER TABLE "Contact" DROP COLUMN IF EXISTS "customerStatusId";
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "leadStageId";

DROP TABLE IF EXISTS "LeadStage";
DROP TABLE IF EXISTS "CustomerStatus";
