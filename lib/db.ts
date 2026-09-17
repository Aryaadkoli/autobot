import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// One Prisma client for the whole app (avoids exhausting DB connections on Next.js hot-reload).
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildClient>;
  prismaBase?: PrismaClient;
};

const adapter = new PrismaPg(process.env.DATABASE_URL as string);

// Soft delete via Prisma's documented query-extension recipe: `base` is the real unextended client (used only inside the extension to perform the actual update); the rest of the app imports the extended `prisma` export unaware .delete()/.findMany() are rewritten.
// findUnique/findUniqueOrThrow are deliberately left unfiltered — whether a soft-deleted row counts there is a per-call-site decision (e.g. uniqueness pre-checks), not a global one.
// Written out per-model rather than looped, so the extension's `args`/`query` types infer correctly (a generic loop erases them to `unknown`).
const base = globalForPrisma.prismaBase ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// Escape hatch to see soft-deleted rows the normal `prisma` export hides — e.g. resurrecting a removed teammate's User row on re-invite (app/api/users/route.ts) instead of hitting the unique constraint.
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
