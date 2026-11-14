import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-5 py-6", className)}>
      {icon && <div className="text-subtle [&_svg]:size-5">{icon}</div>}
      <div>
        <p className="text-[13px] font-medium text-text">{title}</p>
        {description && <p className="mt-0.5 max-w-prose text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
