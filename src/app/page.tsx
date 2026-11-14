export default function Home() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 320px at 50% 38%, rgba(232,163,61,0.08), transparent 70%)",
        }}
      />
      <div className="relative max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-subtle">
          Knowledge handover
        </p>
        <h1 className="mt-3 font-serif text-6xl font-semibold tracking-tight">
          Baton
        </h1>
        <p className="mt-3 text-lg text-muted">
          Hand over the project, not just the files.
        </p>
        <p className="mt-8 font-mono text-xs text-subtle">
          Build skeleton &middot; demo project FestFlow loads here soon
        </p>
      </div>
    </main>
  );
}
