import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border font-medium leading-none tabular-nums",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-2 text-muted",
        outline: "border-border bg-transparent text-muted",
        primary: "border-primary/30 bg-primary/10 text-primary",
        success: "border-verified/30 bg-verified/10 text-verified",
        danger: "border-conflicting/30 bg-conflicting/10 text-conflicting",
        info: "border-single/30 bg-single/10 text-single",
        testimony: "border-testimony/40 bg-testimony/15 text-[#a98be8]",
        count: "border-transparent bg-surface-2 text-muted font-mono",
      },
      size: {
        sm: "h-[18px] px-1.5 text-[11px]",
        md: "h-5 px-1.5 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export function Badge({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
