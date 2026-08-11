-- SMS is not being integrated for now — drop unused MSG91 credential fields.
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "msg91AuthKeyEnc";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "msg91SenderId";
