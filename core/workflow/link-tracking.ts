import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

// Only applied to workflow sends, since that's where a LINK_CLICKED branch actually matters. Requires the Message row to already exist (Link.messageId is a required FK), so this runs between creating the Message and delivering it.
export async function wrapLinksForTracking(
  body: string,
  tenantId: string,
  messageId: string
): Promise<string> {
  const urls = Array.from(new Set(body.match(URL_RE) ?? []));
  if (urls.length === 0) return body;

  let wrapped = body;
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  for (const url of urls) {
    const token = randomBytes(6).toString("base64url");
    await prisma.link.create({ data: { tenantId, messageId, token, targetUrl: url } });
    wrapped = wrapped.split(url).join(`${baseUrl}/r/${token}`);
  }
  return wrapped;
}
