import { cn } from "@/lib/utils";

/** Every page: a title, one plain sentence on what the page is for, and at most one primary action. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: string;
  /** One plain sentence: what this page is for. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5", className)}>
      <div className="min-w-0">
        <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
