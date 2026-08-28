import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// One Prisma client for the whole app (avoids exhausting DB connections
// when Next.js hot-reloads in development).
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildClient>;
  prismaBase?: PrismaClient;
};

const adapter = new PrismaPg(process.env.DATABASE_URL as string);

// Soft delete: Contact, Tag, MessageTemplate, Workflow, and User (team
// membership) are never actually removed from the database — "deleting"
// one of these just sets deletedAt. This is Prisma's own documented
// recipe for it (a query extension): `base` below is the real,
// unextended client, used only inside the extension itself to perform
// the actual update — everywhere else in the app imports the extended
// `prisma` export and just calls .delete()/.findMany() normally, with
// no idea any of this is happening.
//
// findUnique/findUniqueOrThrow are deliberately NOT filtered here (same
// as Prisma's own recipe) — the handful of call sites that use them are
// uniqueness pre-checks (e.g. "does this phone number already exist"),
// where whether a soft-deleted row should still count is a real
// business decision made case-by-case at the call site, not something
// safe to decide globally.
//
// Written out per-model (rather than looped over a model-name array) so
// Prisma's extension types can infer each callback's `args`/`query`
// shape correctly — a generic loop erases that to `unknown`.
const base = globalForPrisma.prismaBase ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// Escape hatch for the rare, deliberate case that needs to see a
// soft-deleted row the normal `prisma` export would hide — e.g.
// resurrecting a removed teammate's User row on re-invite (see
// app/api/users/route.ts) instead of failing on the real unique
// constraint. Reach for this only when you specifically mean "including
// deleted," never as a shortcut around the extension below.
export const prismaIncludingDeleted = base;

function buildClient() {
  return base.$extends({
    name: "soft-delete",
    query: {
      contact: {
        delete: ({ args }) => base.contact.update({ where: args.where, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.contact.updateMany({ where: args.where, data: { deletedAt: new Date() } }),
        findMany: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirst: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirstOrThrow: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        count: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
      },
      tag: {
        delete: ({ args }) => base.tag.update({ where: args.where, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.tag.updateMany({ where: args.where, data: { deletedAt: new Date() } }),
        findMany: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirst: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirstOrThrow: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        count: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
      },
      messageTemplate: {
        delete: ({ args }) => base.messageTemplate.update({ where: args.where, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.messageTemplate.updateMany({ where: args.where, data: { deletedAt: new Date() } }),
        findMany: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirst: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirstOrThrow: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        count: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
      },
      workflow: {
        delete: ({ args }) => base.workflow.update({ where: args.where, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.workflow.updateMany({ where: args.where, data: { deletedAt: new Date() } }),
        findMany: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirst: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirstOrThrow: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        count: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
      },
      user: {
        delete: ({ args }) => base.user.update({ where: args.where, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.user.updateMany({ where: args.where, data: { deletedAt: new Date() } }),
        findMany: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirst: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        findFirstOrThrow: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
        count: ({ args, query }) => query({ ...args, where: { deletedAt: null, ...args.where } }),
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
