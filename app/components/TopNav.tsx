"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={[
        "px-3 py-2 rounded-md text-sm font-medium transition-colors",
        active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function TopNav() {
  return (
    <header className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/import" className="font-semibold tracking-tight">
          Fanben Reader
        </Link>
        <nav className="flex items-center gap-2">
          <NavLink href="/import" label="导入" />
          <NavLink href="/library" label="文章库" />
          <NavLink href="/vocab" label="生词本" />
        </nav>
      </div>
    </header>
  );
}

