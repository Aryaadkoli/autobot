// Pure, dependency-free (no Prisma import) so this is safe to import from
// a client component — lib/permissions.ts pulls in the Prisma client at
// module scope, which breaks the browser bundle if imported client-side.
//
// Single source of truth for "who can remove whom" from a Team — shared
// by the API (app/api/users/[id]/route.ts, enforcement) and the Settings
// UI (settings-client.tsx, so the Remove button isn't even shown for a
// row the click would just 403 on). The only ranked tier today is
// OWNER > CO_OWNER > everyone else (MEMBER and every custom role are
// peers — nothing in the schema ranks them relative to each other yet):
// only the literal OWNER can remove an OWNER or a CO_OWNER, closing both
// "a co-owner removes the owner" and "a co-owner removes another
// co-owner." Below that tier, removal is governed entirely by the TEAM
// edit permission check the caller already does — no peer is considered
// higher authority than another.
export function canRemoveTeamMember(actorRoleName: string, targetRoleName: string): boolean {
  const targetIsOwnerTier = targetRoleName === "OWNER" || targetRoleName === "CO_OWNER";
  if (targetIsOwnerTier) return actorRoleName === "OWNER";
  return true;
}
