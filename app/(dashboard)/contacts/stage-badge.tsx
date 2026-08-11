import { stageMeta } from "./stages";

export default function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta(stage);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}
