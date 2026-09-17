import { prisma } from "@/lib/db";
import { handleEvent } from "@/core/workflow/engine";

// Public, unauthenticated: unknown/expired tokens redirect to the site root rather than erroring,
// since this URL is out in the world on someone's phone.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const link = await prisma.link.findUnique({
    where: { token },
    include: { message: true },
  });
  if (!link) {
    return Response.redirect(process.env.APP_URL ?? "http://localhost:3000", 302);
  }

  await prisma.link.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  await prisma.event.create({
    data: {
      tenantId: link.tenantId,
      contactId: link.message.contactId,
      type: "LINK_CLICKED",
      payload: { messageId: link.messageId, targetUrl: link.targetUrl },
    },
  });
  await handleEvent(link.tenantId, link.message.contactId, "LINK_CLICKED");

  return Response.redirect(link.targetUrl, 302);
}
