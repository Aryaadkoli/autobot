import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { WorkflowDefinitionSchema, validateWorkflowDefinition } from "@/core/workflow/schema";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  definition: z.unknown().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "WORKFLOWS", "edit");
  if (denied) return denied;
  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!workflow) {
    return Response.json({ error: "Workflow not found" }, { status: 404 });
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, status, definition } = parsed.data;

  if (definition !== undefined) {
    const activeCount = await prisma.sequenceInstance.count({
      where: { workflowId: id, status: "ACTIVE" },
    });
    if (activeCount > 0) {
      return Response.json(
        {
          error: `Can't edit the steps while ${activeCount} lead(s) are actively running this workflow — wait for them to finish, or archive and duplicate instead.`,
        },
        { status: 400 }
      );
    }

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
  }

  const updated = await prisma.workflow.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(definition !== undefined ? { definition: definition as object } : {}),
    },
  });

  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied2 = requirePermission(session, "WORKFLOWS", "edit");
  if (denied2) return denied2;
  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!workflow) {
    return Response.json({ error: "Workflow not found" }, { status: 404 });
  }

  const instanceCount = await prisma.sequenceInstance.count({ where: { workflowId: id } });
  if (instanceCount > 0) {
    return Response.json(
      {
        error: `${instanceCount} lead(s) have run through this workflow (active or finished) — archive it instead of deleting, so their history stays intact.`,
      },
      { status: 400 }
    );
  }

  await prisma.workflow.delete({ where: { id } });
  return Response.json({ id });
}
