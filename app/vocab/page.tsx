"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";

type VocabPayload = {
  headword?: string;
  phonetic?: string;
  pronunciation?: { text?: string; audioUrl?: string };
  coreMeaning?: { partOfSpeech?: string; gloss?: string };
  senses?: { definitions?: string[] }[];
  morphology?: { note?: string };
};

type VocabItem = {
  id: string;
  word: string;
  normalized: string;
  payloadJson: VocabPayload;
  sourceContext?: string | null;
  addedAt: string;
  documentId?: string | null;
};

export default function VocabPage() {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await apiFetch<VocabItem[]>("/api/vocab");
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setItems(res.data);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: unknown) {
        setError(getErrorMessage(e, "加载失败"));
      }
    })();
  }, []);

  async function remove(id: string) {
    await apiFetch(`/api/vocab/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Vocabulary</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">生词本</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-600">在阅读页里划词并“加入生词本”，这里会沉淀你的高频生词和阅读上下文。</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4">
        {items.map((it) => (
          <div key={it.id} className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">
                  {it.payloadJson?.headword || it.word}
                  {(it.payloadJson?.pronunciation?.text || it.payloadJson?.phonetic) ? (
                    <span className="ml-2 text-sm font-normal text-zinc-500">
                      /{it.payloadJson?.pronunciation?.text || it.payloadJson?.phonetic}/
                    </span>
                  ) : null}
                </div>
                {it.payloadJson?.headword && it.payloadJson.headword !== it.normalized ? (
                  <div className="mt-1 text-xs text-zinc-500">正文词形：{it.word}</div>
                ) : null}
                <div className="mt-1 text-xs text-zinc-500">
                  {new Date(it.addedAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => remove(it.id)}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50"
              >
                删除
              </button>
            </div>
            {it.payloadJson?.coreMeaning?.gloss ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-zinc-800">
                <span className="mr-2 text-xs font-medium uppercase text-amber-700">
                  {it.payloadJson.coreMeaning.partOfSpeech || "核心释义"}
                </span>
                {it.payloadJson.coreMeaning.gloss}
              </div>
            ) : null}
            <div className="mt-3 text-sm text-zinc-700 leading-6">
              {Array.isArray(it.payloadJson?.senses) ? (
                <ul className="list-disc pl-5">
                  {(it.payloadJson.senses || [])
                    .flatMap((s) => s.definitions || [])
                    .slice(0, 3)
                    .map((d: string, idx: number) => (
                      <li key={idx}>{d}</li>
                    ))}
                </ul>
              ) : (
                <div className="text-zinc-500">（无释义）</div>
              )}
            </div>
            {it.payloadJson?.morphology?.note ? (
              <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <span className="font-medium">词根词缀：</span>
                {it.payloadJson.morphology.note}
              </div>
            ) : null}
            {it.sourceContext ? (
              <div className="mt-3 text-xs text-zinc-500">
                <span className="font-medium">上下文：</span>
                {it.sourceContext}
              </div>
            ) : null}
          </div>
        ))}

        {items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-[#FBFAF6] p-8 text-sm leading-7 text-zinc-600">
            你还没有加入任何生词。去阅读页划词试试～
          </div>
        ) : null}
      </div>
    </div>
  );
}
