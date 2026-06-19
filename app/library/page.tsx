"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type DocItem = {
  id: string;
  title: string;
  status: {
    content: "PROCESSING" | "READY" | "FAILED";
    analysis: "PENDING" | "PROCESSING" | "READY" | "FAILED";
    canRead: boolean;
  };
  createdAt: string;
  favored: boolean;
  percent: number;
  sentenceCount: number;
  analysisSummary: {
    total: number;
    ready: number;
    processing: number;
    pending: number;
    failed: number;
  };
};

// Stable formatter: lock locale + timezone so SSR and the browser agree.
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

const WORKFLOW_STEPS = [
  {
    n: "01",
    title: "导入文章",
    desc: "支持 URL 抽取，也支持直接粘贴正文。遇到登录墙、抽取失败或排版异常时，粘贴模式最稳。",
  },
  {
    n: "02",
    title: "阅读与查词",
    desc: "进入阅读页后，纯英/双语切换、段前解析入口、划词即查，AI 解析会持续补齐。",
  },
  {
    n: "03",
    title: "沉淀与回顾",
    desc: "看过的生词自动进生词本，每篇文章的阅读进度和解析状态都会同步到文章库。",
  },
];

export default function LibraryPage() {
  const [items, setItems] = useState<DocItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<DocItem[]>("/api/library");
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setItems(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showEmpty = !loading && !error && items.length === 0;

  return (
    <div className="space-y-10">
      {/* 页头 */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Library
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">文章库</h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-600">
            最近导入、正在补解析和已完成精读的文章都会出现在这里。
          </p>
        </div>
        <Link
          href="/import"
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          导入新文章
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      {/* 错误提示 */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      ) : null}

      {/* 加载态 */}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[1.75rem] border border-zinc-200/60 bg-white/60"
            />
          ))}
        </div>
      ) : null}

      {/* 列表 / 空状态 / 引导 三态合一 */}
      {!loading ? (
        <section
          className={[
            "rounded-[2rem] border p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)] md:p-8",
            showEmpty
              ? "border-zinc-200/60 bg-gradient-to-br from-white via-[#FBFAF6] to-[#F1ECDF]"
              : "border-black/5 bg-white",
          ].join(" ")}
        >
          {items.length > 0 ? (
            <div className="grid gap-3">
              {items.map((it) => (
                <Link
                  key={it.id}
                  href={`/reader/${it.id}`}
                  className="rounded-2xl border border-zinc-100 bg-white p-4 transition-colors hover:border-zinc-200 hover:bg-zinc-50/60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium tracking-tight text-zinc-900">
                        {it.title}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {formatDateTime(it.createdAt)} · 正文 {it.status.content} · 解析{" "}
                        {it.status.analysis}
                        {it.favored ? " · 已收藏" : ""}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        句子 {it.sentenceCount} / 已完成 {it.analysisSummary.ready} / 待补齐{" "}
                        {it.analysisSummary.pending + it.analysisSummary.processing}
                        {it.analysisSummary.failed
                          ? ` / 失败 ${it.analysisSummary.failed}`
                          : ""}
                      </div>
                    </div>
                    <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
                      {Math.round((it.percent || 0) * 100)}%
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full bg-zinc-900"
                      style={{ width: `${Math.round((it.percent || 0) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : null}

          {showEmpty ? <EmptyLibrary /> : null}
        </section>
      ) : null}

      {/* 工作流：始终展示，作为阅读引导 */}
      <section className="rounded-[1.75rem] border border-zinc-200/60 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)] md:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              How it works
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
              一篇文章，从导入到精读的三个动作
            </h2>
          </div>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {WORKFLOW_STEPS.map((s) => (
            <div key={s.n} className="relative">
              <div className="text-3xl font-semibold tracking-tight text-zinc-300">{s.n}</div>
              <div className="mt-2 text-sm font-medium text-zinc-900">{s.title}</div>
              <p className="mt-1 text-sm leading-7 text-zinc-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Welcome
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          你的阅读桌还是空的
        </h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-zinc-600">
          导入一篇你想读透的英文文章——技术博客、长文专栏、新闻稿都行。系统会自动做双语对照、句子拆解、划词即查，帮你从“读一遍”升级成“精读一遍”。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/import"
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            从 URL 导入
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/import"
            className="rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            粘贴正文（更稳）
          </Link>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300/80 bg-white/60 p-4 text-xs leading-6 text-zinc-500">
          遇到登录墙、付费墙或抽取失败时，直接切到 <span className="font-medium text-zinc-700">粘贴正文</span>。
          在自然段之间空一行，分段更干净、阅读体验也更好。
        </div>
      </div>

      <ul className="space-y-3 text-sm leading-7 text-zinc-600">
        <li className="flex gap-3">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
          <span>
            <span className="font-medium text-zinc-900">段前解析入口</span>
            ——点开段落就能看到每句话的成分拆解、关键短语、可能考点。
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
          <span>
            <span className="font-medium text-zinc-900">划词即查</span> + <span className="font-medium text-zinc-900">生词本</span>
            ——选词就出释义、词组、例句；一键进生词本，回看时自动出现原文上下文。
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
          <span>
            <span className="font-medium text-zinc-900">阅读进度同步</span>
            ——滑到哪、读完哪，下次打开直接续上。
          </span>
        </li>
      </ul>
    </div>
  );
}
