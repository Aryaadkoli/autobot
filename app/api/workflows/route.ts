import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { WorkflowDefinitionSchema, validateWorkflowDefinition } from "@/core/workflow/schema";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  serviceId: z.string().min(1),
  definition: z.unknown(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "WORKFLOWS", "view");
  if (denied) return denied;

  const workflows = await prisma.workflow.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { name: true, priority: true } },
      _count: { select: { instances: { where: { status: "ACTIVE" } } } },
    },
  });

  return Response.json(workflows);
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied2 = requirePermission(session, "WORKFLOWS", "edit");
  if (denied2) return denied2;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, serviceId, definition } = parsed.data;

  const defParsed = WorkflowDefinitionSchema.safeParse(definition);
  if (!defParsed.success) {
    return Response.json(
      { error: `Invalid workflow definition: ${defParsed.error.issues[0]?.message}` },
      { status: 400 }
    );
  }
  const refErrors = validateWorkflowDefinition(defParsed.data);
  if (refErrors.length > 0) {
    return Response.json({ error: refErrors[0] }, { status: 400 });
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: session.tenantId },
  });
  if (!service) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const workflow = await prisma.workflow.create({
    data: {
      tenantId: session.tenantId,
      serviceId,
      name,
      definition: defParsed.data as object,
      status: "DRAFT",
    },
  });

  return Response.json(workflow, { status: 201 });
}
