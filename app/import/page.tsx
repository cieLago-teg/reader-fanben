"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { segmentParagraphs } from "@/lib/extract/segment";

type ImportResult = { documentId: string };

export default function ImportPage() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (mode === "url") return url.trim().length > 5;
    return title.trim().length > 0 && text.trim().length > 20;
  }, [mode, url, title, text]);

  const textStats = useMemo(() => {
    if (!text.trim()) return null;
    const paragraphs = segmentParagraphs(text);
    const count = paragraphs.length;
    const maxLength = paragraphs.reduce((max, p) => Math.max(max, p.length), 0);
    
    const needsWarning = 
      count < 5 || 
      (count < 8 && maxLength > 1200) || 
      maxLength > 1800;

    return { count, maxLength, needsWarning };
  }, [text]);

  async function onSubmit() {
    setError(null);
    setDocId(null);
    setLoading(true);
    try {
      if (mode === "url") {
        const res = await apiFetch<ImportResult>("/api/documents/import-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, title: title.trim() || undefined }),
        });
        if (!res.ok) throw new Error(res.error);
        setDocId(res.data.documentId);
      } else {
        const res = await apiFetch<ImportResult>("/api/documents/import-text", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, text }),
        });
        if (!res.ok) throw new Error(res.error);
        setDocId(res.data.documentId);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "导入失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.55fr)]">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Import</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">导入文章</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-600">
          你可以导入 URL（系统尝试抽取正文），或者直接粘贴正文（最稳）。
        </p>
        <div className="mt-4 rounded-[1.75rem] border border-dashed border-zinc-300 bg-[#FBFAF6] p-5 text-sm leading-7 text-zinc-500">
          想要最接近原版 Reader 的体验，优先保证正文分段干净。遇到抽取失败、排版异常或登录墙，就直接切到“粘贴正文”。
        </div>
      </div>

      <div className="rounded-[1.9rem] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
        <div className="flex gap-2">
          <button
            className={[
              "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
              mode === "url" ? "bg-zinc-900 text-white border-zinc-900" : "hover:bg-zinc-50",
            ].join(" ")}
            onClick={() => setMode("url")}
            type="button"
          >
            导入网址
          </button>
          <button
            className={[
              "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
              mode === "text" ? "bg-zinc-900 text-white border-zinc-900" : "hover:bg-zinc-50",
            ].join(" ")}
            onClick={() => setMode("text")}
            type="button"
          >
            粘贴正文
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">标题（可选）</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：Sam Altman on AI’s future"
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {mode === "url" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">文章 URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-200"
              />
              <p className="text-xs text-zinc-500 leading-5">
                如果网站需要登录/付费墙/反爬，抓取可能失败；那就改用“粘贴正文”。
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">英文正文</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="把英文正文贴进来..."
                rows={10}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-200"
              />
              {textStats ? (
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-zinc-500">
                    预计分为 <span className="font-medium text-zinc-700">{textStats.count}</span> 段，最长段落约 <span className="font-medium text-zinc-700">{textStats.maxLength}</span> 字符
                  </div>
                  {textStats.needsWarning ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-700 border border-amber-200/60">
                      <span className="font-semibold">提示：</span>检测到段落较少或单段过长。如果粘贴时丢失了换行格式，建议手动在自然段之间加个<span className="font-semibold">空行（回车两次）</span>，这样会有更好的阅读体验哦！
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSubmit || loading}
              onClick={onSubmit}
              className={[
                "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                !canSubmit || loading
                  ? "bg-zinc-200 text-zinc-500"
                  : "bg-zinc-900 text-white hover:bg-zinc-800",
              ].join(" ")}
            >
              {loading ? "加工中…" : "开始加工"}
            </button>

            {docId ? (
              <Link
                href={`/reader/${docId}`}
                className="text-sm font-medium text-zinc-900 underline underline-offset-4"
              >
                打开阅读页 →
              </Link>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
