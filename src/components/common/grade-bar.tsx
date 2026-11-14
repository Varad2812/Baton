import type { Grade } from "@/generated/prisma/enums";
import { GRADE_COLOR, GRADE_LABEL, GRADE_ORDER } from "@/lib/views/format";
import { cn } from "@/lib/utils";

export function GradeBar({
  grades,
  className,
  legend = false,
  height = 6,
}: {
  grades: Record<Grade, number>;
  className?: string;
  legend?: boolean;
  height?: number;
}) {
  const total = GRADE_ORDER.reduce((s, g) => s + grades[g], 0) || 1;
  return (
    <div className={className}>
      <div className="flex w-full gap-px overflow-hidden rounded-sm" style={{ height }} role="img"
        aria-label={GRADE_ORDER.map((g) => `${GRADE_LABEL[g]} ${grades[g]}`).join(", ")}>
        {GRADE_ORDER.filter((g) => grades[g] > 0).map((g) => (
          <span key={g} style={{ width: `${(grades[g] / total) * 100}%`, background: GRADE_COLOR[g] }} />
        ))}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {GRADE_ORDER.map((g) => (
            <span key={g} className={cn("inline-flex items-center gap-1 text-[11px] text-subtle")}>
              <span className="size-1.5 rounded-full" style={{ background: GRADE_COLOR[g] }} />
              {GRADE_LABEL[g]} <span className="font-mono text-muted">{grades[g]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
