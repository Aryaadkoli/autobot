import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { handleEvent, cancelActiveInstances } from "@/core/workflow/engine";

// Meta's webhook handshake — configure the same value as META_VERIFY_TOKEN in the Meta App dashboard.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

type MetaStatus = {
  id: string; // our providerMessageId (wamid)
  status: "sent" | "delivered" | "read" | "failed";
  recipient_id: string;
};

type MetaInboundMessage = {
  from: string;
  text?: { body: string };
};

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "opt out", "optout"]);

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: {
    entry?: {
      changes?: {
        value?: {
          statuses?: MetaStatus[];
          messages?: MetaInboundMessage[];
          metadata?: { phone_number_id?: string };
        };
      }[];
    }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        await handleStatus(status);
      }
      const inboundMessages = change.value?.messages ?? [];
      if (inboundMessages.length === 0) continue;

      // Resolve the owning tenant via phone_number_id first — phone alone isn't globally unique, only per-tenant (schema.prisma).
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const tenant = await prisma.tenant.findFirst({
        where: { waPhoneNumberId: phoneNumberId },
        select: { id: true },
      });
      if (!tenant) continue; // not a number we know about

      for (const message of inboundMessages) {
        await handleInboundMessage(tenant.id, message);
      }
    }
  }

  return new Response("OK", { status: 200 });
}

const STATUS_MAP: Record<MetaStatus["status"], { messageStatus: string; eventType: string | null }> = {
  sent: { messageStatus: "SENT", eventType: null }, // already recorded at send time
  delivered: { messageStatus: "DELIVERED", eventType: "MSG_DELIVERED" },
  read: { messageStatus: "READ", eventType: "MSG_READ" },
  failed: { messageStatus: "FAILED", eventType: "MSG_FAILED" },
};

async function handleStatus(status: MetaStatus) {
  const mapping = STATUS_MAP[status.status];
  if (!mapping) return;

  const message = await prisma.message.findFirst({
    where: { providerMessageId: status.id },
  });
  if (!message) return; // not one of ours, or not sent through this yet

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: mapping.messageStatus as never,
      statusUpdatedAt: new Date(),
    },
  });

  if (mapping.eventType) {
    await prisma.event.create({
      data: {
        tenantId: message.tenantId,
        contactId: message.contactId,
        type: mapping.eventType as never,
        payload: { messageId: message.id },
      },
    });
  }
}

async function handleInboundMessage(tenantId: string, message: MetaInboundMessage) {
  const phone = normalizePhone(message.from);
  if (!phone) return;

  // tenantId comes from the caller's phone_number_id resolution — phone alone isn't globally unique (schema.prisma).
  const contact = await prisma.contact.findFirst({ where: { phone, tenantId } });
  if (!contact) return;

  const body = message.text?.body?.trim().toLowerCase() ?? "";

  if (OPT_OUT_WORDS.has(body)) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { waOptedOut: true },
    });
    await prisma.event.create({
      data: {
        tenantId: contact.tenantId,
        contactId: contact.id,
        type: "OPTED_OUT",
        payload: { channel: "WHATSAPP" },
      },
    });
    // Opt-out also cancels in-flight workflows, not just future sends (CLAUDE.md rule #5).
    await cancelActiveInstances(contact.tenantId, contact.id);
    return;
  }

  await prisma.event.create({
    data: {
      tenantId: contact.tenantId,
      contactId: contact.id,
      type: "REPLIED",
      payload: { body: message.text?.body ?? "" },
    },
  });
  // Lets a workflow waiting on a reply react now (goto/pivot) instead of timing out later.
  await handleEvent(contact.tenantId, contact.id, "REPLIED");
}
