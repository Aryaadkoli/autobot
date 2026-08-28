-- Convert the fixed `Role` enum on User into a real per-tenant `Role`
-- table, so tenants can add custom roles and soft-delete roles that are
-- still assigned to someone. Every existing tenant gets its three
-- built-in roles (OWNER/ADMIN/AGENT, isSystem = true) created here and
-- every existing User row is repointed at the matching one — no role
-- assignment changes as a result of this migration.

-- 1. The old enum type is also named "Role", and Postgres won't let a
-- table share a name with an existing type in the same schema (a table
-- implicitly creates a matching row type) — rename it out of the way
-- first, drop it for good at the end once nothing references it.
ALTER TYPE "Role" RENAME TO "Role_old_enum";

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Seed the three system roles for every tenant that already exists.
INSERT INTO "Role" ("id", "tenantId", "name", "isSystem")
SELECT gen_random_uuid()::text, t."id", r.name, true
FROM "Tenant" t
CROSS JOIN (VALUES ('OWNER'), ('ADMIN'), ('AGENT')) AS r(name);

-- 3. Add the new column, backfill it from the old enum column, then swap.
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

UPDATE "User" u
SET "roleId" = r."id"
FROM "Role" r
WHERE r."tenantId" = u."tenantId" AND r."name" = u."role"::text;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role_old_enum";
