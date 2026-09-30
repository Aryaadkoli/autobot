// Shared between page.tsx (server) and leads-client.tsx (client) — kept in
// its own plain module rather than exported from leads-client.tsx, since a
// "use client" file's non-component exports can end up serialized oddly
// (a number crossing that boundary turned into a string, breaking
// Prisma's `take` argument, in exactly this case).
export const PAGE_SIZE = 20;
