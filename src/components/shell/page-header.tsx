import { cn } from "@/lib/utils";
import { TryHint } from "@/components/shell/try-hint";

export function PageHeader({
  title,
  description,
  tryThis,
  actions,
  meta,
  className,
}: {
  title: string;
  /** One plain sentence: what this page is for. */
  description?: React.ReactNode;
  /** The single most important action on the page; `selector` finds the button to highlight. */
  tryThis?: { text: string; selector?: string };
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-6 pb-5", className)}>
      <div className="min-w-0">
        <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p>}
        {tryThis && <TryHint {...tryThis} />}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
