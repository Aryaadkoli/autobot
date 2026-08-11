// Evaluates a TagRule.condition tree (see prisma/schema.prisma TagRule comment)
// against a contact's attributes. Framework-free, pure function.

type Leaf = { attr: string; op: string; value?: unknown };
type Node = { all: ConditionNode[] } | { any: ConditionNode[] } | Leaf;
export type ConditionNode = Node;

function isLeaf(node: ConditionNode): node is Leaf {
  return "attr" in node && "op" in node;
}

function evalLeaf(leaf: Leaf, attributes: Record<string, unknown>): boolean {
  const actual = attributes[leaf.attr];

  switch (leaf.op) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "eq":
      return String(actual ?? "") === String(leaf.value ?? "");
    case "neq":
      return String(actual ?? "") !== String(leaf.value ?? "");
    case "contains":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(leaf.value ?? "").toLowerCase());
    case "gt":
      return Number(actual) > Number(leaf.value);
    case "gte":
      return Number(actual) >= Number(leaf.value);
    case "lt":
      return Number(actual) < Number(leaf.value);
    case "lte":
      return Number(actual) <= Number(leaf.value);
    case "olderThanDays": {
      if (!actual) return false;
      const date = new Date(String(actual));
      if (Number.isNaN(date.getTime())) return false;
      const days = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
      return days > Number(leaf.value);
    }
    default:
      return false;
  }
}

export function evaluateCondition(
  node: ConditionNode,
  attributes: Record<string, unknown>
): boolean {
  if (isLeaf(node)) return evalLeaf(node, attributes);
  if ("all" in node) return node.all.every((n) => evaluateCondition(n, attributes));
  if ("any" in node) return node.any.some((n) => evaluateCondition(n, attributes));
  return false;
}
