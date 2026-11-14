"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";

/**
 * Button bound to a server action. When the persona lacks permission the button renders disabled with a
 * reason, but the server action still enforces the rule on its own.
 */
export function ActionButton({
  action,
  children,
  disabledReason,
  variant = "outline",
  size = "sm",
  className,
  onDone,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  disabledReason?: string | null;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg";
  className?: string;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const btn = (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={!!disabledReason || pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          toast(r);
          onDone?.(r);
        })
      }
    >
      {pending && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </Button>
  );
  if (disabledReason) return <Tooltip content={disabledReason}>{btn}</Tooltip>;
  return btn;
}
