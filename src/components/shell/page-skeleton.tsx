import { Skeleton } from "@/components/ui/skeleton";

function Header() {
  return (
    <div className="pb-5">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2.5 h-3.5 w-[560px]" />
      <Skeleton className="mt-2 h-3 w-80" />
    </div>
  );
}

function Rows({ n, className = "" }: { n: number; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface ${className}`}>
      <div className="h-11 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Layout-matched loading states, so nothing shifts when data arrives. */
export function PageSkeleton({ variant }: { variant: "dashboard" | "rail" | "split" | "stack" }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Header />
      {variant === "dashboard" && (
        <>
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-lg" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Skeleton className="col-span-2 h-[440px] rounded-lg" />
            <Skeleton className="h-[440px] rounded-lg" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Skeleton className="h-[380px] rounded-lg" />
            <Skeleton className="h-[380px] rounded-lg" />
            <Skeleton className="h-[380px] rounded-lg" />
          </div>
        </>
      )}
      {variant === "rail" && (
        <div className="grid grid-cols-[216px_minmax(0,1fr)] gap-6">
          <div className="space-y-2">
            {Array.from({ length: 14 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-14 rounded-lg" />
            <Rows n={12} />
          </div>
        </div>
      )}
      {variant === "split" && (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-3">
            <Rows n={5} />
            <Rows n={4} />
          </div>
          <Skeleton className="h-[520px] rounded-lg" />
        </div>
      )}
      {variant === "stack" && (
        <div className="space-y-3">
          <Skeleton className="h-[340px] rounded-lg" />
          <Skeleton className="h-[340px] rounded-lg" />
        </div>
      )}
    </div>
  );
}
