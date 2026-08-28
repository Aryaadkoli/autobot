-- Real per-role permissions, replacing "every role except OWNER is
-- identical." New role set: OWNER (unchanged), CO_OWNER (renamed from
-- ADMIN — same as OWNER except it can't touch an OWNER/CO_OWNER account,
-- enforced in lib/permissions.ts, not here), MEMBER (renamed from AGENT).
-- Existing ADMIN/AGENT rows and every User pointing at them are
-- preserved as-is — this only renames them in place, no membership
-- changes.

UPDATE "Role" SET name = 'CO_OWNER' WHERE name = 'ADMIN' AND "isSystem" = true;
UPDATE "Role" SET name = 'MEMBER' WHERE name = 'AGENT' AND "isSystem" = true;

CREATE TYPE "Module" AS ENUM ('LEADS', 'TEMPLATES', 'CAMPAIGNS', 'WORKFLOWS', 'ANALYTICS', 'TEAM', 'SETTINGS');

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_roleId_module_key" ON "RolePermission"("roleId", "module");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default permissions for every existing MEMBER role (formerly AGENT):
-- can see the day-to-day work areas, can't edit anything yet, and has no
-- visibility into the team or WhatsApp/sending settings. The owner can
-- change any of this per-tenant afterward — this is just a sane
-- starting point so a freshly-renamed MEMBER isn't silently locked out
-- of everything they could already see a moment ago.
-- OWNER and CO_OWNER intentionally get no rows — they bypass permission
-- checks entirely (see lib/permissions.ts).
INSERT INTO "RolePermission" ("id", "roleId", "module", "canView", "canEdit")
SELECT gen_random_uuid()::text, r."id", m.module::"Module", true, false
FROM "Role" r
CROSS JOIN (VALUES ('LEADS'), ('TEMPLATES'), ('CAMPAIGNS'), ('WORKFLOWS'), ('ANALYTICS')) AS m(module)
WHERE r.name = 'MEMBER' AND r."isSystem" = true;
