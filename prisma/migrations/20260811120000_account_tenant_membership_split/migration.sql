-- Splits the login identity (email + password) out of the per-tenant
-- User row into a new global Account, so one email can hold memberships
-- in more than one Tenant. User becomes a pure membership row.

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- One Account per distinct existing email (in the old single-tenant
-- model, the same email could theoretically appear on more than one
-- User row across tenants — DISTINCT ON collapses that to one Account,
-- keeping the earliest row's password/name as the login identity).
INSERT INTO "Account" ("id", "email", "passwordHash", "name", "createdAt")
SELECT DISTINCT ON ("email") gen_random_uuid()::text, "email", "passwordHash", "name", "createdAt"
FROM "User"
ORDER BY "email", "createdAt" ASC;

ALTER TABLE "User" ADD COLUMN "accountId" TEXT;
UPDATE "User" u SET "accountId" = a."id" FROM "Account" a WHERE a."email" = u."email";
ALTER TABLE "User" ALTER COLUMN "accountId" SET NOT NULL;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_email_key";
ALTER TABLE "User" DROP COLUMN "email";
ALTER TABLE "User" DROP COLUMN "passwordHash";
ALTER TABLE "User" DROP COLUMN "name";

ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "User_tenantId_accountId_key" ON "User"("tenantId", "accountId");
