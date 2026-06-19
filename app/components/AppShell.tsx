"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavItem({
  href,
  label,
  shortLabel,
}: {
  href: string;
  label: string;
  shortLabel: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={[
        "flex h-10 w-10 items-center justify-center rounded-2xl border text-xs font-medium transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900",
      ].join(" ")}
    >
      {shortLabel}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReaderRoute = pathname.startsWith("/reader/");

  if (isReaderRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-[#F5F2E8] text-zinc-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-20 shrink-0 border-r border-black/5 bg-[#F8F6F0] md:flex md:flex-col md:items-center md:justify-between md:py-6">
          <div className="flex flex-col items-center gap-4">
            <span
              aria-label="Fanben Reader"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-semibold text-white select-none"
            >
              FR
            </span>
            <NavItem href="/import" label="导入文章" shortLabel="导" />
            <NavItem href="/library" label="文章库" shortLabel="库" />
            <NavItem href="/vocab" label="生词本" shortLabel="词" />
          </div>

          <div className="px-3 text-center text-[11px] leading-5 text-zinc-400">
            Reader-like
            <br />
            workflow
          </div>
        </aside>

        <main className="flex-1">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-6 px-5 py-5 md:px-8 md:py-7">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Fanben Reader
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                Build A Reader-Like Study Flow
              </div>
            </div>
            <div className="hidden rounded-full border border-zinc-200/80 bg-white/80 px-4 py-2 text-xs text-zinc-500 backdrop-blur md:block">
              Import, read, look up, collect, review.
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-5 pb-8 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
