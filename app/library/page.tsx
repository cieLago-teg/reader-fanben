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

export default function LibraryPage() {
  const [items, setItems] = useState<DocItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<DocItem[]>("/api/library");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!cancelled) setItems(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Library</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">文章库</h1>
          <p className="mt-2 text-sm leading-7 text-zinc-600">最近导入、正在补解析和已完成精读的文章都会出现在这里。</p>
        </div>
        <Link
          href="/import"
          className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          导入新文章
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4">
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/reader/${it.id}`}
            className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-medium tracking-tight text-zinc-900">{it.title}</div>
                <div className="mt-2 text-xs text-zinc-500">
                  {new Date(it.createdAt).toLocaleString()} · 正文 {it.status.content} · 解析{" "}
                  {it.status.analysis}
                  {it.favored ? " · 已收藏" : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  句子 {it.sentenceCount} / 已完成 {it.analysisSummary.ready} / 待补齐{" "}
                  {it.analysisSummary.pending + it.analysisSummary.processing}
                  {it.analysisSummary.failed ? ` / 失败 ${it.analysisSummary.failed}` : ""}
                </div>
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
                {Math.round((it.percent || 0) * 100)}%
              </div>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-zinc-900"
                style={{ width: `${Math.round((it.percent || 0) * 100)}%` }}
              />
            </div>
          </Link>
        ))}

        {items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-[#FBFAF6] p-8 text-sm leading-7 text-zinc-600">
            还没有文章。去 <Link className="font-medium underline underline-offset-4" href="/import">导入</Link> 一篇试试，先把你最想读的那篇英文文章放进来。
          </div>
        ) : null}
      </div>
    </div>
  );
}
