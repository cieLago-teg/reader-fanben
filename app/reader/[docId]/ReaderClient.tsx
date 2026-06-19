"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch, type ApiResponse } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { normalizeSelectedWord } from "@/lib/lexicon/normalize";
import type { LexiconResult } from "@/lib/lexicon/types";

type DocPayload = {
  document: {
    id: string;
    title: string;
    sourceType: string;
    sourceUrl?: string | null;
    createdAt: string;
    analysisUpdatedAt?: string | null;
    status: {
      content: "PROCESSING" | "READY" | "FAILED";
      analysis: "PENDING" | "PROCESSING" | "READY" | "FAILED";
      canRead: boolean;
    };
    analysisSummary: {
      total: number;
      ready: number;
      processing: number;
      pending: number;
      failed: number;
    };
    analysisActions?: {
      queuePath: string;
      retryFailedPath: string;
    };
  };
  paragraphs: {
    id: string;
    idx: number;
    enText: string;
    zhText: string;
    sentences: {
      id: string;
      idx: number;
      paragraphIdx: number;
      sentenceIdx: number;
      stableKey: string;
      enText: string;
      analysis: {
        status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
        version: number;
        provider?: string | null;
        sourceType: string;
        updatedAt?: string | null;
        retryCount: number;
        error?: string | null;
        canRetry: boolean;
        result: {
          translation: string;
          chunks: { text: string; gloss?: string | null; role?: string | null }[];
          inlineAnnotations?: {
            id: string;
            text: string;
            start: number;
            end: number;
            color: "amber" | "teal" | "violet" | "rose" | "sky";
            label: string;
            detail: string;
            role?: string | null;
          }[];
          structure?: { id?: string; label: string; detail: string; annotationIds?: string[] }[];
          notes: string[];
        } | null;
      } | null;
      retryAction?: {
        path: string;
        method: "POST";
        body: {
          sentenceId: string;
          mode: "failed" | "all";
        };
      } | null;
      manualRefineAction?: {
        path: string;
        method: "PATCH";
        body: {
          sentenceId: string;
          stableKey: string;
          expectedVersion: number;
        };
      } | null;
      questionAnswer?: {
        scope: "sentence";
        status: "idle" | "submitting" | "answered" | "error";
        request: {
          path: string;
          method: "POST";
          body: {
            sentenceId: string;
            stableKey: string;
            expectedVersion: number;
            question: string;
            scope: "sentence";
          };
        };
        response: {
          question: string;
          answer: string | null;
          error: string | null;
          updatedAt: string | null;
        };
      };
    }[];
  }[];
  progress: { lastParagraphIdx: number; percent: number } | null;
  favored: boolean;
};

type LookupResult = LexiconResult;

type ReaderMode = "en" | "bilingual";
type ReaderFetch = <T>(input: RequestInfo | URL, init?: RequestInit) => Promise<ApiResponse<T>>;
type ReaderClientProps = {
  docId: string;
  fetcher?: ReaderFetch;
};

type ParagraphCard = DocPayload["paragraphs"][number] & {
  readySentences: number;
  pendingSentences: number;
  failedSentences: number;
  previewNote: string | null;
  previewTranslation: string;
};

type SentenceCard = DocPayload["paragraphs"][number]["sentences"][number] & {
  paragraphId: string;
  paragraphIdx: number;
  paragraphEnText: string;
  paragraphZhText: string;
};

type LookupWordHit = {
  rawWord: string;
  normalizedWord: string;
};

const VIEW_MODE_STORAGE_KEY = "reader:view-mode";
const RAIL_OPEN_STORAGE_KEY = "reader:rail-open";
type RailTab = "analysis" | "notes";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readStoredViewMode(): ReaderMode {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "bilingual" ? "bilingual" : "en";
}

function readStoredRailState() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) === "1";
}

function readUrlState(): {
  railOpen: boolean | null;
  railTab: RailTab | null;
  paragraphIdx: number | null;
} {
  if (typeof window === "undefined") {
    return { railOpen: null, railTab: null, paragraphIdx: null };
  }
  const params = new URLSearchParams(window.location.search);
  const rail = params.get("rail");
  const tab = params.get("tab");
  const p = params.get("p");

  let railTab: RailTab | null = null;
  if (tab === "notes") railTab = "notes";
  else if (tab === "analysis") railTab = "analysis";

  return {
    railOpen: rail === "open" ? true : rail === "closed" ? false : null,
    railTab,
    paragraphIdx: p !== null && Number.isFinite(Number(p)) ? Math.max(0, Math.floor(Number(p))) : null,
  };
}

function syncStateToUrl(state: { railOpen: boolean; railTab: RailTab; activeIdx: number | null }) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);

  if (state.railOpen) {
    params.set("rail", "open");
    params.set("tab", state.railTab);
  } else {
    params.set("rail", "closed");
    params.delete("tab");
  }

  if (state.activeIdx !== null) {
    params.set("p", String(state.activeIdx));
  } else {
    params.delete("p");
  }

  const next = params.toString();
  const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function getClosestParagraphIdx(paragraphRefs: Map<number, HTMLParagraphElement>) {
  if (typeof window === "undefined" || paragraphRefs.size === 0) return null;

  const anchorLine = Math.max(window.innerHeight * 0.22, 120);
  let bestIdx: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [idx, el] of paragraphRefs.entries()) {
    const rect = el.getBoundingClientRect();
    const distance = Math.abs(rect.top - anchorLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

function buildParagraphCard(paragraph: DocPayload["paragraphs"][number]): ParagraphCard {
  const readySentences = paragraph.sentences.filter((sentence) => sentence.analysis?.status === "READY").length;
  const pendingSentences = paragraph.sentences.filter((sentence) =>
    sentence.analysis?.status === "PENDING" || sentence.analysis?.status === "PROCESSING",
  ).length;
  const failedSentences = paragraph.sentences.filter((sentence) => sentence.analysis?.status === "FAILED").length;
  const firstReadyAnalysis = paragraph.sentences.find((sentence) => sentence.analysis?.result)?.analysis?.result;

  return {
    ...paragraph,
    readySentences,
    pendingSentences,
    failedSentences,
    previewNote: firstReadyAnalysis?.notes[0] ?? null,
    previewTranslation: firstReadyAnalysis?.translation ?? paragraph.zhText,
  };
}

function summarizeSentenceAnalyses(paragraphs: DocPayload["paragraphs"]) {
  return paragraphs.reduce(
    (summary, paragraph) => {
      for (const sentence of paragraph.sentences) {
        summary.total += 1;
        const status = sentence.analysis?.status ?? "PENDING";
        if (status === "READY") summary.ready += 1;
        if (status === "PROCESSING") summary.processing += 1;
        if (status === "PENDING") summary.pending += 1;
        if (status === "FAILED") summary.failed += 1;
      }
      return summary;
    },
    {
      total: 0,
      ready: 0,
      processing: 0,
      pending: 0,
      failed: 0,
    },
  );
}

function resolveDocumentAnalysisStatus(summary: DocPayload["document"]["analysisSummary"]) {
  if (summary.processing > 0) return "PROCESSING" as const;
  if (summary.pending > 0) return "PENDING" as const;
  if (summary.failed > 0) return "FAILED" as const;
  return "READY" as const;
}

function updateSentenceInPayload(
  current: DocPayload,
  sentenceId: string,
  updater: (sentence: SentenceCard) => SentenceCard,
) {
  const nextParagraphs = current.paragraphs.map((paragraph) => ({
    ...paragraph,
    sentences: paragraph.sentences.map((sentence) => {
      if (sentence.id !== sentenceId) return sentence;
      return updater({
        ...sentence,
        paragraphId: paragraph.id,
        paragraphIdx: paragraph.idx,
        paragraphEnText: paragraph.enText,
        paragraphZhText: paragraph.zhText,
      });
    }),
  }));
  const analysisSummary = summarizeSentenceAnalyses(nextParagraphs);

  return {
    ...current,
    paragraphs: nextParagraphs,
    document: {
      ...current.document,
      status: {
        ...current.document.status,
        analysis: resolveDocumentAnalysisStatus(analysisSummary),
      },
      analysisSummary,
    },
  };
}

function getSentenceActionLabel(sentence: SentenceCard) {
  const status = sentence.analysis?.status ?? "PENDING";
  if (status === "READY") return "查看解析";
  if (status === "FAILED") return "重试解析";
  if (status === "PROCESSING") return "解析补齐中";
  return "等待解析";
}

function getSentenceStatusTone(sentence: SentenceCard) {
  const status = sentence.analysis?.status ?? "PENDING";
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "PROCESSING") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function getSentenceStatusDotClass(sentence: SentenceCard) {
  const status = sentence.analysis?.status ?? "PENDING";
  if (status === "READY") return "bg-emerald-500";
  if (status === "FAILED") return "bg-red-500";
  if (status === "PROCESSING") return "bg-sky-500 animate-pulse";
  return "bg-zinc-300";
}

const INLINE_ANNOTATION_TONES = {
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    panel: "border-amber-100/80 bg-amber-50/50",
    underline: "decoration-amber-400",
  },
  teal: {
    badge: "border-teal-200 bg-teal-50 text-teal-700",
    panel: "border-teal-100/80 bg-teal-50/50",
    underline: "decoration-teal-400",
  },
  violet: {
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    panel: "border-violet-100/80 bg-violet-50/50",
    underline: "decoration-violet-400",
  },
  rose: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    panel: "border-rose-100/80 bg-rose-50/50",
    underline: "decoration-rose-400",
  },
  sky: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    panel: "border-sky-100/80 bg-sky-50/50",
    underline: "decoration-sky-400",
  },
} as const;

function getInlineAnnotationTone(color: "amber" | "teal" | "violet" | "rose" | "sky") {
  return INLINE_ANNOTATION_TONES[color];
}

function renderAnnotatedSentenceText(
  sentenceText: string,
  annotations: Array<{
    id: string;
    start: number;
    end: number;
    color: "amber" | "teal" | "violet" | "rose" | "sky";
  }>,
) {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  const sorted = [...annotations].sort((a, b) => a.start - b.start || b.end - a.end);
  for (const annotation of sorted) {
    const start = Math.max(0, Math.min(annotation.start, sentenceText.length));
    const end = Math.max(start, Math.min(annotation.end, sentenceText.length));
    if (end <= cursor) continue;

    if (start > cursor) {
      nodes.push(sentenceText.slice(cursor, start));
    }

    nodes.push(
      <span
        key={annotation.id}
        className={[
          "rounded-[0.2rem] underline decoration-2 underline-offset-[0.28em]",
          getInlineAnnotationTone(annotation.color).underline,
        ].join(" ")}
      >
        {sentenceText.slice(start, end)}
      </span>,
    );
    cursor = end;
  }

  if (cursor < sentenceText.length) {
    nodes.push(sentenceText.slice(cursor));
  }

  return nodes;
}

function extractNoteHighlightText(note: string) {
  const quotedMatches = [
    note.match(/'([^']+)'/),
    note.match(/"([^"]+)"/),
    note.match(/“([^”]+)”/),
    note.match(/「([^」]+)」/),
  ]
    .map((match) => match?.[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return quotedMatches[0] ?? null;
}

export function ReaderClient({ docId, fetcher = apiFetch }: ReaderClientProps) {
  const [data, setData] = useState<DocPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ReaderMode>("en");
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("analysis");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [focusedParagraphIdx, setFocusedParagraphIdx] = useState<number | null>(null);
  const [percent, setPercent] = useState(0);
  const [favored, setFavored] = useState(false);

  const enRefs = useRef<Map<number, HTMLParagraphElement>>(new Map());
  const pendingAnchorIdxRef = useRef<number | null>(null);
  const initialProgressRestoredRef = useRef(false);
  const preferencesLoadedRef = useRef(false);
  const autoRetriedFailedRef = useRef<string | null>(null);

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedSentenceId, setSelectedSentenceId] = useState<string | null>(null);
  const [sentenceFeedback, setSentenceFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  const [retryingSentenceId, setRetryingSentenceId] = useState<string | null>(null);
  const [sentenceQuestionDrafts, setSentenceQuestionDrafts] = useState<Record<string, string>>({});
  const [noteHighlight, setNoteHighlight] = useState<{
    paragraphIdx: number;
    sentenceId: string;
    text: string;
  } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedWord, setSelectedWord] = useState("");
  const [selectionContext, setSelectionContext] = useState("");
  const [vocabStatus, setVocabStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [vocabMessage, setVocabMessage] = useState<string | null>(null);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const lookupCacheRef = useRef<Map<string, LookupResult>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  const paragraphs = useMemo(() => data?.paragraphs ?? [], [data?.paragraphs]);
  const paragraphCards = useMemo(() => paragraphs.map(buildParagraphCard), [paragraphs]);
  const sentenceCards = useMemo(
    () =>
      paragraphs.flatMap((paragraph) =>
        paragraph.sentences.map((sentence) => ({
          ...sentence,
          paragraphId: paragraph.id,
          paragraphIdx: paragraph.idx,
          paragraphEnText: paragraph.enText,
          paragraphZhText: paragraph.zhText,
        })),
      ),
    [paragraphs],
  );
  const activeParagraph = useMemo(() => {
    if (!paragraphCards.length) return null;
    const preferredIdx = activeIdx ?? data?.progress?.lastParagraphIdx ?? paragraphCards[0].idx;
    return paragraphCards.find((paragraph) => paragraph.idx === preferredIdx) ?? paragraphCards[0];
  }, [activeIdx, data?.progress?.lastParagraphIdx, paragraphCards]);
  const sidebarParagraph = useMemo(() => {
    if (!paragraphCards.length) return null;
    const preferredIdx = focusedParagraphIdx ?? data?.progress?.lastParagraphIdx ?? paragraphCards[0].idx;
    return paragraphCards.find((paragraph) => paragraph.idx === preferredIdx) ?? paragraphCards[0];
  }, [data?.progress?.lastParagraphIdx, focusedParagraphIdx, paragraphCards]);
  const paragraphSentenceCards = useMemo(
    () => sentenceCards.filter((sentence) => sentence.paragraphIdx === (sidebarParagraph?.idx ?? -1)),
    [sentenceCards, sidebarParagraph?.idx],
  );
  const noteCards = useMemo(() => {
    const centerIdx = sidebarParagraph?.idx ?? activeParagraph?.idx ?? 0;
    return sentenceCards
      .filter((sentence) => sentence.analysis?.result?.notes?.length)
      .flatMap((sentence) =>
        (sentence.analysis?.result?.notes ?? []).map((note, noteIdx) => ({
          id: `${sentence.id}-note-${noteIdx}`,
          sentenceId: sentence.id,
          paragraphIdx: sentence.paragraphIdx,
          sentenceIdx: sentence.sentenceIdx,
          note,
          translation: sentence.analysis?.result?.translation ?? "",
          enText: sentence.enText,
          distance: Math.abs(sentence.paragraphIdx - centerIdx),
        })),
      )
      .sort((a, b) => a.distance - b.distance || a.paragraphIdx - b.paragraphIdx || a.sentenceIdx - b.sentenceIdx)
      .slice(0, 8);
  }, [activeParagraph?.idx, sentenceCards, sidebarParagraph?.idx]);
  const selectedSentence = useMemo(
    () => sentenceCards.find((sentence) => sentence.id === selectedSentenceId) ?? null,
    [selectedSentenceId, sentenceCards],
  );
  const progressText = useMemo(() => `${Math.round(percent * 100)}%`, [percent]);
  const sentenceSummaryText = useMemo(() => {
    if (!data) return "";
    const summary = data.document.analysisSummary;
    return `句子 ${summary.total} / 已完成 ${summary.ready} / 待补齐 ${summary.pending + summary.processing} / 失败 ${summary.failed}`;
  }, [data]);
  const readingSurfaceClass =
    viewMode === "bilingual"
      ? "mx-auto max-w-[1280px]"
      : "mx-auto max-w-[760px]";
  const englishParagraphClass = "text-[1.22rem] leading-[2.16rem] text-zinc-800 font-sans";
  const bilingualParagraphClass = "text-[1.06rem] leading-[2.16rem] text-zinc-800";

  const loadDocument = useCallback(
    async (options?: { silent?: boolean; syncPercent?: boolean }) => {
      const silent = options?.silent ?? false;
      const syncPercent = options?.syncPercent ?? false;

      try {
        const res = await fetcher<DocPayload>(`/api/documents/${docId}`);
        if (!res.ok) {
          if (!silent) {
            setError(res.error);
          }
          return;
        }

        setError(null);
        setData(res.data);
        if (syncPercent) {
          setPercent(res.data.progress?.percent ?? 0);
        }
        if (res.data.favored !== undefined) {
          setFavored(res.data.favored);
        }
      } catch (err) {
        if (!silent) {
          setError(getErrorMessage(err, "加载文档失败"));
        }
      }
    },
    [docId, fetcher],
  );

  useEffect(() => {
    const nextViewMode = readStoredViewMode();
    const urlState = readUrlState();
    const nextRailState = urlState.railOpen ?? readStoredRailState();
    const nextRailTab: RailTab = urlState.railTab ?? "analysis";
    const frameId = window.requestAnimationFrame(() => {
      setViewMode(nextViewMode);
      setIsRailOpen(nextRailState);
      setRailTab(nextRailTab);
      if (urlState.paragraphIdx !== null) {
        setFocusedParagraphIdx(urlState.paragraphIdx);
      }
      preferencesLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  // Mirror rail / tab / active paragraph into the URL so refreshes + shares keep state.
  useEffect(() => {
    if (!preferencesLoadedRef.current) return;
    syncStateToUrl({ railOpen: isRailOpen, railTab, activeIdx: focusedParagraphIdx });
  }, [isRailOpen, railTab, focusedParagraphIdx]);

  useEffect(() => {
    void loadDocument({ syncPercent: true });
  }, [loadDocument]);

  useEffect(() => {
    if (!isRailOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (railRef.current && railRef.current.contains(target)) return;
      // Don't auto-close when the user is clicking the rail toggle button itself —
      // a separate capture-phase handler would race with its onClick and leave the
      // rail stuck in the wrong state. The button owns the toggle.
      if (target instanceof Element && target.closest("[data-rail-trigger]")) return;
      setIsRailOpen(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "0");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isRailOpen]);

  useEffect(() => {
    if (!data) return;
    const handleScroll = () => {};
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [data, activeIdx]);

  useEffect(() => {
    if (pendingAnchorIdxRef.current === null) return;
    const anchorIdx = pendingAnchorIdxRef.current;
    const frameId = window.requestAnimationFrame(() => {
      enRefs.current.get(anchorIdx)?.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingAnchorIdxRef.current = null;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [viewMode]);

  useEffect(() => {
    if (!data) return;
    if (data.document.analysisSummary.failed === 0) return;
    const retryFailedPath = data.document.analysisActions?.retryFailedPath;
    if (!retryFailedPath) return;
    if (autoRetriedFailedRef.current === data.document.id) return;

    autoRetriedFailedRef.current = data.document.id;

    fetcher<any>(retryFailedPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "failed" }),
    })
      .then((res) => {
        if (!res.ok) {
          setSentenceFeedback({ tone: "error", message: `自动补解析失败：${res.error}` });
          return;
        }

        setSentenceFeedback({ tone: "success", message: "已自动重新提交失败句子的解析任务" });
        setData((current) => {
          if (!current) return current;
          const nextParagraphs: DocPayload["paragraphs"] = current.paragraphs.map((paragraph) => ({
            ...paragraph,
            sentences: paragraph.sentences.map((sentence) => {
              if (sentence.analysis?.status !== "FAILED") return sentence;
              return {
                ...sentence,
                analysis: sentence.analysis
                  ? {
                      ...sentence.analysis,
                      status: "PROCESSING" as const,
                      error: null,
                    }
                  : null,
              };
            }),
          }));
          const nextSummary = summarizeSentenceAnalyses(nextParagraphs);
          return {
            ...current,
            document: {
              ...current.document,
              analysisSummary: nextSummary,
              status: {
                ...current.document.status,
                analysis: resolveDocumentAnalysisStatus(nextSummary),
              },
            },
            paragraphs: nextParagraphs,
          };
        });
      })
      .catch((err) => {
        setSentenceFeedback({ tone: "error", message: getErrorMessage(err, "自动补解析失败") });
      });
  }, [data, fetcher]);

  useEffect(() => {
    if (!data) return;
    if (
      data.document.analysisSummary.pending === 0 &&
      data.document.analysisSummary.processing === 0
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadDocument({ silent: true });
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [data?.document.analysisSummary.pending, data?.document.analysisSummary.processing, loadDocument, data]);

  useEffect(() => {
    if (!data) return;
    if (
      data.document.analysisSummary.pending === 0 &&
      data.document.analysisSummary.processing === 0
    ) {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadDocument({ silent: true });
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [data?.document.analysisSummary.pending, data?.document.analysisSummary.processing, loadDocument, data]);

  const toggleViewMode = () => {
    pendingAnchorIdxRef.current =
      activeIdx ?? focusedParagraphIdx ?? getClosestParagraphIdx(enRefs.current) ?? data?.progress?.lastParagraphIdx ?? null;
    const nextMode = viewMode === "en" ? "bilingual" : "en";
    setViewMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
    }
  };

  const toggleRail = () => {
    const nextState = !isRailOpen;
    if (nextState && focusedParagraphIdx === null) {
      const anchorIdx = activeIdx ?? data?.progress?.lastParagraphIdx ?? paragraphCards[0]?.idx ?? null;
      if (anchorIdx !== null) {
        setFocusedParagraphIdx(anchorIdx);
      }
    }
    setIsRailOpen(nextState);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, nextState ? "1" : "0");
    }
  };

  const openParagraphRail = (idx: number, sentenceId?: string | null) => {
    setActiveIdx(idx);
    setFocusedParagraphIdx(idx);
    setRailTab("analysis");
    // Always force the rail open here — the outside-click handler may have just
    // flipped it to `false` on pointerdown, and the onClick closure still sees
    // the previous value, so a simple `if (!isRailOpen)` would silently no-op.
    setIsRailOpen(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "1");
    }
    if (sentenceId) {
      setSelectedSentenceId(sentenceId);
      return;
    }
    const paragraph = paragraphCards.find((item) => item.idx === idx);
    if (paragraph?.sentences.length) {
      setSelectedSentenceId(paragraph.sentences[0].id);
    }
  };

  const revealSentenceDetail = (sentenceId: string, paragraphIdx: number, options?: { forceOpen?: boolean }) => {
    setFocusedParagraphIdx(paragraphIdx);
    setRailTab("analysis");
    setSelectedSentenceId((current) => {
      if (options?.forceOpen) return sentenceId;
      return current === sentenceId ? null : sentenceId;
    });
  };

  const toggleFavorite = async () => {
    const nextState = !favored;
    setFavored(nextState);
    const method = nextState ? "POST" : "DELETE";
    try {
      await fetcher(`/api/favorites/${docId}`, { method });
    } catch (e) {
      setFavored(!nextState);
    }
  };

  const onMouseUpInEnglish = (event: React.MouseEvent) => {
    if (typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || text.length > 50 || text.includes(" ")) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setPopoverPos({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
    setDragOffset({ x: 0, y: 0 });
    setSelectedWord(text);
    setLookupLoading(true);
    setLookupError(null);
    setVocabStatus("idle");
    setVocabMessage(null);

    const node = selection.anchorNode;
    if (node && node.parentElement) {
      setSelectionContext(node.parentElement.textContent || text);
    } else {
      setSelectionContext(text);
    }

    const normalized = normalizeSelectedWord(text);
    if (lookupCacheRef.current.has(normalized)) {
      setLookup(lookupCacheRef.current.get(normalized) ?? null);
      setLookupLoading(false);
      return;
    }

    fetcher<LookupResult>("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: text, context: node && node.parentElement ? node.parentElement.textContent : undefined }),
    }).then((res) => {
      setLookupLoading(false);
      if (!res.ok) {
        setLookupError(res.error);
      } else {
        lookupCacheRef.current.set(normalized, res.data);
        setLookup(res.data);
      }
    }).catch((err) => {
      setLookupLoading(false);
      setLookupError(getErrorMessage(err, "查词请求失败"));
    });
  };

  const retrySentenceAnalysis = async (sentence: SentenceCard) => {
    if (!sentence.retryAction) return;
    setRetryingSentenceId(sentence.id);
    setSentenceFeedback(null);
    try {
      const res = await fetcher<any>(sentence.retryAction.path, {
        method: sentence.retryAction.method as string,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sentence.retryAction.body),
      });
      if (!res.ok) {
        setSentenceFeedback({ tone: "error", message: res.error });
      } else {
        setSentenceFeedback({ tone: "success", message: "重试请求已提交" });
        if (data) {
          setData(updateSentenceInPayload(data, sentence.id, (s) => ({
            ...s,
            analysis: s.analysis ? { ...s.analysis, status: "PROCESSING" } : null
          })));
        }
      }
    } catch (err) {
      setSentenceFeedback({ tone: "error", message: getErrorMessage(err, "请求失败") });
    } finally {
      setRetryingSentenceId(null);
    }
  };

  const getSentenceQuestionDraft = (sentence: SentenceCard) =>
    sentenceQuestionDrafts[sentence.id] ??
    sentence.questionAnswer?.response.question ??
    sentence.questionAnswer?.request.body.question ??
    "";

  const clearSentenceQuestion = (sentenceId: string) => {
    setSentenceQuestionDrafts((current) => {
      if (!(sentenceId in current)) return current;
      const next = { ...current };
      delete next[sentenceId];
      return next;
    });

    setData((current) => {
      if (!current) return current;
      return updateSentenceInPayload(current, sentenceId, (sentence) => ({
        ...sentence,
        questionAnswer: sentence.questionAnswer
          ? {
              ...sentence.questionAnswer,
              status: "idle",
              request: {
                ...sentence.questionAnswer.request,
                body: {
                  ...sentence.questionAnswer.request.body,
                  question: "",
                },
              },
              response: {
                question: "",
                answer: null,
                error: null,
                updatedAt: null,
              },
            }
          : sentence.questionAnswer,
      }));
    });
  };

  const updateSentenceQuestionDraft = (sentenceId: string, nextValue: string) => {
    setSentenceQuestionDrafts((current) => ({
      ...current,
      [sentenceId]: nextValue,
    }));
  };

  const submitSentenceQuestion = async (sentence: SentenceCard) => {
    if (!sentence.questionAnswer) return;
    const question = getSentenceQuestionDraft(sentence).trim();

    if (!question) {
      setData((current) => {
        if (!current) return current;
        return updateSentenceInPayload(current, sentence.id, (currentSentence) => ({
          ...currentSentence,
          questionAnswer: currentSentence.questionAnswer
            ? {
                ...currentSentence.questionAnswer,
                status: "error",
                request: {
                  ...currentSentence.questionAnswer.request,
                  body: {
                    ...currentSentence.questionAnswer.request.body,
                    question: "",
                  },
                },
                response: {
                  question: "",
                  answer: null,
                  error: "先输入你想追问的问题。",
                  updatedAt: null,
                },
              }
            : currentSentence.questionAnswer,
        }));
      });
      return;
    }

    setData((current) => {
      if (!current) return current;
      return updateSentenceInPayload(current, sentence.id, (currentSentence) => ({
        ...currentSentence,
        questionAnswer: currentSentence.questionAnswer
          ? {
              ...currentSentence.questionAnswer,
              status: "submitting",
              request: {
                ...currentSentence.questionAnswer.request,
                body: {
                  ...currentSentence.questionAnswer.request.body,
                  question,
                },
              },
              response: {
                question,
                answer: null,
                error: null,
                updatedAt: null,
              },
            }
          : currentSentence.questionAnswer,
      }));
    });

    try {
      const res = await fetcher<{ question: string; answer: string; updatedAt: string }>(
        sentence.questionAnswer.request.path,
        {
          method: sentence.questionAnswer.request.method as string,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sentence.questionAnswer.request.body,
            question,
          }),
        },
      );

      setData((current) => {
        if (!current) return current;
        return updateSentenceInPayload(current, sentence.id, (currentSentence) => ({
          ...currentSentence,
          questionAnswer: currentSentence.questionAnswer
            ? res.ok
              ? {
                  ...currentSentence.questionAnswer,
                  status: "answered",
                  request: {
                    ...currentSentence.questionAnswer.request,
                    body: {
                      ...currentSentence.questionAnswer.request.body,
                      question,
                    },
                  },
                  response: {
                    question: res.data.question,
                    answer: res.data.answer,
                    error: null,
                    updatedAt: res.data.updatedAt,
                  },
                }
              : {
                  ...currentSentence.questionAnswer,
                  status: "error",
                  request: {
                    ...currentSentence.questionAnswer.request,
                    body: {
                      ...currentSentence.questionAnswer.request.body,
                      question,
                    },
                  },
                  response: {
                    question,
                    answer: null,
                    error: res.error,
                    updatedAt: null,
                  },
                }
            : currentSentence.questionAnswer,
        }));
      });
    } catch (err) {
      setData((current) => {
        if (!current) return current;
        return updateSentenceInPayload(current, sentence.id, (currentSentence) => ({
          ...currentSentence,
          questionAnswer: currentSentence.questionAnswer
            ? {
                ...currentSentence.questionAnswer,
                status: "error",
                request: {
                  ...currentSentence.questionAnswer.request,
                  body: {
                    ...currentSentence.questionAnswer.request.body,
                    question,
                  },
                },
                response: {
                  question,
                  answer: null,
                  error: getErrorMessage(err, "句子问答失败"),
                  updatedAt: null,
                },
              }
            : currentSentence.questionAnswer,
        }));
      });
    }
  };

  const jumpToParagraph = (idx: number) => {
    setActiveIdx(idx);
    const el = enRefs.current.get(idx);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const speak = (text: string) => {
    // If the same text is already playing, the second click stops it.
    if (speakingText === text) {
      stopSpeaking();
      return;
    }
    const normalized = normalizeSelectedWord(text);
    const result = lookupCacheRef.current.get(normalized);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (result?.pronunciation?.audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = result.pronunciation.audioUrl;
      setSpeakingText(text);
      audioRef.current.onended = () => setSpeakingText((current) => (current === text ? null : current));
      audioRef.current.play().catch(() => {
        setSpeakingText(null);
      });
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      utterance.onend = () => setSpeakingText((current) => (current === text ? null : current));
      utterance.onerror = () => setSpeakingText(null);
      setSpeakingText(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingText(null);
  };

  const closeLookup = useCallback(() => {
    audioRef.current?.pause();
    setPopoverPos(null);
    setLookup(null);
    setLookupError(null);
    setVocabStatus("idle");
    setVocabMessage(null);
  }, []);

  // Global keyboard shortcuts: Esc closes the lookup popover or stops speech.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        // Let the field handle its own Esc (e.g. IME composition cancel).
        return;
      }
      if (popoverPos) {
        event.preventDefault();
        closeLookup();
        return;
      }
      if (speakingText) {
        event.preventDefault();
        stopSpeaking();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popoverPos, speakingText, closeLookup]);

  const addToVocab = async () => {
    const word = lookup?.headword || selectedWord;
    if (!word) return;
    setVocabStatus("saving");
    setVocabMessage(null);
    try {
      const res = await fetcher<any>("/api/vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          word, 
          documentId: docId, 
          context: selectionContext,
          translation: lookup?.coreMeaning?.gloss || null
        }),
      });
      if (!res.ok) {
        setVocabStatus("error");
        setVocabMessage(res.error);
      } else {
        setVocabStatus("saved");
      }
    } catch (err) {
      setVocabStatus("error");
      setVocabMessage(getErrorMessage(err, "保存失败"));
    }
  };

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }
  if (!data) {
    return <div className="p-8 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#FDFDFC] text-zinc-900">
      {/* Sidebar */}
      <aside className="w-14 shrink-0 border-r border-zinc-100 flex-col items-center py-4 justify-between hidden md:flex">
        <div className="flex flex-col items-center gap-6">
          <div className="font-bold text-xl mb-2" aria-label="Fanben Reader">R</div>
          <Link
            href="/library"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"
            title="书库"
            aria-label="返回文章库"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          </Link>
          <button
            type="button"
            onClick={toggleRail}
            data-rail-trigger
            aria-label={isRailOpen ? "收起学习侧栏" : "打开学习侧栏"}
            aria-pressed={isRailOpen}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
              isRailOpen ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900",
            ].join(" ")}
            title="学习侧栏"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true">
              <path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4" />
              <polyline points="11 12 12 12 12 17 13 17" />
              <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Top Navigation */}
        <header className="h-14 flex items-center justify-between px-6 shrink-0 bg-[#FDFDFC] z-10 border-b border-transparent">
          <Link href="/library" className="text-zinc-400 hover:text-zinc-900 transition-colors">
            <span className="sr-only">返回文章库</span>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </Link>
          
          <div
            data-reader-toolbar-actions
            data-toolbar-balance={isRailOpen ? "rail-open" : "default"}
            className={[
              "flex items-center text-zinc-400 font-medium transition-all duration-200",
              isRailOpen ? "gap-3 text-[12px]" : "gap-6 text-[13px]",
            ].join(" ")}
          >
            <span
              aria-label={`阅读进度 ${Math.round(percent * 100)}%`}
              className={["tabular-nums transition-all", isRailOpen ? "min-w-10 text-right" : ""].join(" ")}
            >
              {Math.round(percent * 100)}%
            </span>

            <div
              role="group"
              aria-label="阅读模式"
              className={[
                "inline-flex items-center rounded-full border bg-white p-0.5 transition-colors",
                isRailOpen ? "border-zinc-200" : "border-zinc-200",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => {
                  if (viewMode === "en") return;
                  toggleViewMode();
                }}
                aria-pressed={viewMode === "en"}
                className={[
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                  viewMode === "en" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
                title="纯英文阅读模式"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMode === "bilingual") return;
                  toggleViewMode();
                }}
                aria-pressed={viewMode === "bilingual"}
                className={[
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                  viewMode === "bilingual" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
                title="中英双语阅读模式"
              >
                中英
              </button>
            </div>

            <button
              type="button"
              onClick={toggleFavorite}
              aria-pressed={favored}
              className={[
                "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                isRailOpen
                  ? "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                  : "border-transparent",
                favored ? "border-zinc-300 bg-zinc-50 text-zinc-900" : "hover:text-zinc-900",
              ].join(" ")}
              title="收藏"
              aria-label={favored ? "取消收藏文章" : "收藏文章"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill={favored ? "currentColor" : "none"} aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </header>

        {/* Scrollable Document Area */}
        <div
          className="flex-1 overflow-y-auto pb-32 pt-10 px-6 sm:px-12 md:px-16 lg:px-24"
          data-reader-density="immersive"
          onScroll={(e) => { const target = e.currentTarget; const docHeight = target.scrollHeight - target.clientHeight; if (docHeight > 0) setPercent(target.scrollTop / docHeight); const closest = getClosestParagraphIdx(enRefs.current); if (closest !== null && closest !== activeIdx) setActiveIdx(closest); }}
        >
          <div className={readingSurfaceClass}>
            <div className="mb-12">
              <h1 className="text-[2.5rem] md:text-5xl font-bold tracking-tight text-zinc-900 mb-6 leading-tight">
                {data.document.title}
              </h1>
              <div className="flex items-center gap-4 text-[13px] text-zinc-400 pb-6 border-b border-zinc-100">
                <span>{data.document.sourceType === "URL" ? "Source URL" : "Sam Altman"}</span>
                <span>{Math.max(1, Math.round(data.document.analysisSummary.total / 15))} min read · {data.document.analysisSummary.total * 15} words total</span>
              </div>
            </div>

            <div className="space-y-10 md:space-y-14" onMouseUp={onMouseUpInEnglish}>
              {paragraphCards.map((paragraph) => {
                const isActive = activeParagraph?.idx === paragraph.idx || activeIdx === paragraph.idx;
                const isSidebarSelected = isRailOpen && sidebarParagraph?.idx === paragraph.idx;
                const highlightText = noteHighlight?.paragraphIdx === paragraph.idx ? noteHighlight.text : null;
                const highlightIndex = highlightText ? paragraph.enText.indexOf(highlightText) : -1;
                const paragraphEnContent =
                  highlightText && highlightIndex >= 0 ? (
                    <>
                      {paragraph.enText.slice(0, highlightIndex)}
                      <span data-sentence-highlight="active" className="text-zinc-900 font-semibold">
                        {paragraph.enText.slice(highlightIndex, highlightIndex + highlightText.length)}
                      </span>
                      {paragraph.enText.slice(highlightIndex + highlightText.length)}
                    </>
                  ) : (
                    paragraph.enText
                  );
                return (
                  <div 
                    key={paragraph.id} 
                    className={[
                      viewMode === "bilingual" ? "grid grid-cols-2 gap-x-12 items-start" : "flex flex-col",
                      "group"
                    ].join(" ")}
                  >
                    <div
                      className="relative"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openParagraphRail(paragraph.idx);
                        }}
                        aria-pressed={sidebarParagraph?.idx === paragraph.idx}
                        className={[
                          "absolute -left-10 top-2 hidden h-7 w-7 items-center justify-center rounded-full border text-zinc-400 shadow-sm transition-all md:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                          sidebarParagraph?.idx === paragraph.idx
                            ? "border-zinc-300 bg-zinc-50 text-zinc-900 opacity-100"
                            : "border-zinc-200/70 bg-white opacity-60 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 hover:opacity-100 group-hover:opacity-100",
                        ].join(" ")}
                        title="查看这一段的逐句解析"
                        aria-label={`查看第 ${paragraph.idx + 1} 段的逐句解析`}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true">
                          <path d="M5 12h14" />
                          <path d="M12 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div 
                      className={[
                        "relative -mx-3 cursor-text rounded-2xl px-3 py-2",
                        isSidebarSelected
                          ? "border border-zinc-200 bg-zinc-50/60 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.04)]"
                          : isActive
                            ? "bg-zinc-50/80"
                            : "border border-transparent"
                      ].join(" ")}
                      data-paragraph-focus-state={isSidebarSelected ? "selected" : isActive ? "active" : "idle"}
                      data-idx={paragraph.idx}
                      ref={(el) => {
                        if (el) enRefs.current.set(paragraph.idx, el);
                        else enRefs.current.delete(paragraph.idx);
                      }}
                    >
                      <p className={englishParagraphClass}>{paragraphEnContent}</p>
                      </div>
                    </div>
                    
                    {viewMode === "bilingual" && (
                      <div className="relative pt-[4px]">
                        <p className={bilingualParagraphClass}>
                          {paragraph.zhText}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating rail toggle — only visible on mobile (the desktop sidebar has its own). */}
        <button
          type="button"
          onClick={toggleRail}
          data-rail-trigger
          aria-label={isRailOpen ? "收起学习侧栏" : "打开学习侧栏"}
          aria-pressed={isRailOpen}
          className={[
            "absolute bottom-6 right-6 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-colors md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
            isRailOpen ? "border-zinc-300 bg-zinc-50 text-zinc-900" : "border-zinc-100 text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true">
            <path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4" />
            <polyline points="11 12 12 12 12 17 13 17" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </main>

      {/* Right Sidebar (Learning Rail) */}
      {isRailOpen && (
        <aside
          ref={railRef}
          data-study-rail-width="wide"
          className="w-[440px] shrink-0 border-l border-zinc-100 bg-white flex flex-col h-full z-30 shadow-[-14px_0_40px_rgba(15,23,42,0.035)]"
        >
          <div className="flex h-full flex-col px-7 py-6">
            <div className="border-b border-zinc-100 pb-4 flex justify-between items-center">
              <div className="text-xs uppercase tracking-[0.15em] text-zinc-400 font-semibold">学习侧栏</div>
              <button
                type="button"
                onClick={toggleRail}
                data-rail-trigger
                aria-label="关闭学习侧栏"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-[1.15rem] bg-zinc-50/90 p-1.5">
              <button
                type="button"
                onClick={() => setRailTab("analysis")}
                className={[
                  "rounded-[0.95rem] px-4 py-2.5 text-sm font-medium transition-colors",
                  railTab === "analysis" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
              >
                段落解析
              </button>
              <button
                type="button"
                onClick={() => setRailTab("notes")}
                className={[
                  "rounded-[0.95rem] px-4 py-2.5 text-sm font-medium transition-colors",
                  railTab === "notes" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
              >
                学习批注
              </button>
            </div>

            <div className="mt-6 space-y-6 overflow-y-auto pr-2 pb-20">
              {railTab === "analysis" ? (
              <section className="rounded-2xl bg-zinc-50 p-5 border border-zinc-100/50">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    {sidebarParagraph ? `逐句解析 · 第 ${sidebarParagraph.idx + 1} 段` : "逐句解析"}
                  </div>
                  {sidebarParagraph ? (
                    <div className="text-[11px] text-zinc-400">
                      {paragraphSentenceCards.length} 句
                    </div>
                  ) : null}
                </div>
                {sentenceFeedback ? (
                  <div
                    className={[
                      "mb-4 rounded-xl px-3 py-2 text-xs",
                      sentenceFeedback.tone === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {sentenceFeedback.message}
                  </div>
                ) : null}
                {sidebarParagraph ? (
                  <>
                    <div className="space-y-3">
                      {paragraphSentenceCards.map((sentence) => {
                        const isSelected = selectedSentence?.id === sentence.id;
                        const translation = sentence.analysis?.result?.translation;
                        const annotations = sentence.analysis?.result?.inlineAnnotations ?? [];
                        const structures = sentence.analysis?.result?.structure ?? [];
                        const questionAnswer = sentence.questionAnswer;
                        const questionDraft = getSentenceQuestionDraft(sentence);

                        return (
                          <div
                            key={sentence.id}
                            onClick={(event) => {
                              const target = event.target as HTMLElement;
                              if (target.closest("textarea, button, a, input")) return;
                              revealSentenceDetail(sentence.id, sentence.paragraphIdx);
                            }}
                            data-sentence-id={sentence.id}
                            data-sentence-card-state={isSelected ? "expanded" : "collapsed"}
                              className={[
                                "group relative w-full border-b border-black text-left transition-colors duration-200",
                                isSelected
                                  ? "bg-white"
                                  : "hover:bg-zinc-50",
                              ].join(" ")}
                            >
                              <div
                                className={[
                                  "absolute inset-y-0 left-0 w-[2px] transition-colors",
                                  isSelected ? "bg-zinc-900" : "bg-transparent",
                                ].join(" ")}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  revealSentenceDetail(sentence.id, sentence.paragraphIdx);
                                }}
                                className="block w-full px-5 py-5 text-left"
                              >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <div className="text-[12px] font-medium text-zinc-500">第 {sentence.sentenceIdx + 1} 句</div>
                                    <span
                                      className={["inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px]", getSentenceStatusTone(sentence)].join(" ")}
                                      aria-label={`解析状态：${getSentenceActionLabel(sentence)}`}
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={["inline-block h-1.5 w-1.5 rounded-full", getSentenceStatusDotClass(sentence)].join(" ")}
                                      />
                                      {getSentenceActionLabel(sentence)}
                                    </span>
                                  </div>
                                  <span
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      speak(sentence.enText);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        speak(sentence.enText);
                                      }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-pressed={speakingText === sentence.enText}
                                    aria-label={
                                      speakingText === sentence.enText
                                        ? `停止朗读第 ${sentence.sentenceIdx + 1} 句`
                                        : `朗读第 ${sentence.sentenceIdx + 1} 句`
                                    }
                                    className={[
                                      "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                                      speakingText === sentence.enText ? "bg-zinc-100 text-zinc-900" : "",
                                    ].join(" ")}
                                  >
                                    {speakingText === sentence.enText ? (
                                      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                                        <rect x="6" y="5" width="4" height="14" rx="1" />
                                        <rect x="14" y="5" width="4" height="14" rx="1" />
                                      </svg>
                                    ) : (
                                      <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true">
                                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                                      </svg>
                                    )}
                                  </span>
                                </div>
                                <div className="font-sans text-[15px] leading-7 text-zinc-900 break-words">
                                  {isSelected && annotations.length ? (
                                    <span className="font-sans">{renderAnnotatedSentenceText(sentence.enText, annotations)}</span>
                                  ) : (
                                    sentence.enText
                                  )}
                                </div>
                                {!isSelected || !sentence.analysis?.result ? (
                                  <div className="mt-3 text-[13px] leading-6 text-zinc-800 break-words">
                                    {translation ?? (sentence.analysis?.status === "FAILED" ? "这句解析失败了，点进去可以重试。" : "这句正在补解析，稍后会自动出现中译和知识点。")}
                                  </div>
                                ) : null}
                              </button>
                              {isSelected ? (
                                <div
                                  data-sentence-detail-state="expanded"
                                  className="px-5 pb-5 opacity-100 transition-[opacity,transform] duration-200 ease-out"
                                >
                                  {sentence.analysis?.status === "FAILED" ? (
                                    <div className="space-y-3">
                                      <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                                        {sentence.analysis.error || "句子解析失败，请稍后重试。"}
                                      </div>
                                      <button
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void retrySentenceAnalysis(sentence);
                                        }}
                                        disabled={retryingSentenceId === sentence.id}
                                        className="w-full rounded bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors"
                                      >
                                        {retryingSentenceId === sentence.id ? "重试提交中…" : "重试解析"}
                                      </button>
                                    </div>
                                  ) : null}

                                  {(sentence.analysis?.status === "PENDING" ||
                                    sentence.analysis?.status === "PROCESSING") ? (
                                    <div className="rounded bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                                      解析补齐中，先继续阅读，过一会儿回来这张卡片会自动补完整。
                                    </div>
                                  ) : null}

                                  {sentence.analysis?.result ? (
                                    <div className="space-y-6 mt-1">
                                      <div className="text-[13px] leading-6 text-zinc-800 break-words">
                                        {sentence.analysis.result.translation}
                                      </div>

                                    {structures.length ? (
                                      <section className="pt-5 border-t border-black">
                                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                                          语法说明
                                        </div>
                                        <div className="space-y-2 text-[12px] leading-relaxed text-zinc-600">
                                          {structures.map((item, index) => (
                                            <div key={`${sentence.id}-structure-${index}`}>
                                              {item.detail}
                                            </div>
                                          ))}
                                        </div>
                                      </section>
                                    ) : null}

                                    {sentence.analysis.result.notes.length ? (
                                      <section className="pt-5 border-t border-black">
                                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                                          阅读提醒
                                        </div>
                                        <div className="space-y-2 text-[12px] leading-relaxed text-zinc-600">
                                          {sentence.analysis.result.notes.map((note, index) => (
                                            <div key={`${sentence.id}-note-${index}`}>
                                              {note}
                                            </div>
                                          ))}
                                        </div>
                                      </section>
                                    ) : null}

                                    {questionAnswer ? (
                                    <section className="mt-5 pt-5 border-t border-black">
                                      <label
                                        htmlFor={`sentence-question-${sentence.id}`}
                                        className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400"
                                      >
                                        Q&A · 对这句提问
                                      </label>
                                      <div className="space-y-3">
                                        <textarea
                                          id={`sentence-question-${sentence.id}`}
                                          name={`sentence-question-${sentence.id}`}
                                          value={questionDraft}
                                          onClick={(event) => event.stopPropagation()}
                                          onChange={(event) => {
                                            updateSentenceQuestionDraft(sentence.id, event.target.value);
                                          }}
                                          onInput={(event) => {
                                            updateSentenceQuestionDraft(sentence.id, event.currentTarget.value);
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                              event.preventDefault();
                                              if (questionAnswer.status !== "submitting" && questionDraft.trim()) {
                                                void submitSentenceQuestion(sentence);
                                              }
                                            }
                                          }}
                                          rows={2}
                                          spellCheck={false}
                                          autoComplete="off"
                                          placeholder="对这句话有疑问？直接问我..."
                                          aria-label={`对第 ${sentence.sentenceIdx + 1} 句提问`}
                                          className="w-full resize-none rounded-lg bg-zinc-50 border border-transparent px-3 py-2 text-[13px] leading-6 text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus-visible:border-zinc-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                                        />
                                        <div className="flex items-center justify-between">
                                          <div className="text-[11px] text-zinc-400">
                                            {questionAnswer.status === "submitting" ? "思考中..." : "Shift+Enter 换行，Enter 发送"}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void submitSentenceQuestion(sentence);
                                            }}
                                            disabled={questionAnswer.status === "submitting" || !questionDraft.trim()}
                                            aria-label="发送问题"
                                            className="rounded bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"
                                          >
                                            发送
                                          </button>
                                        </div>
                                      </div>

                                      {(questionAnswer.response.answer || questionAnswer.response.error) ? (
                                        <div className="mt-4 text-[13px] leading-relaxed text-zinc-600">
                                          {questionAnswer.response.question ? (
                                            <div className="mb-2 font-medium text-zinc-800">
                                              {questionAnswer.response.question}
                                            </div>
                                          ) : null}
                                          {questionAnswer.response.answer ? (
                                            <div>{questionAnswer.response.answer}</div>
                                          ) : null}
                                          {questionAnswer.response.error ? (
                                            <div className="text-red-600">{questionAnswer.response.error}</div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </section>
                                  ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] text-zinc-400">将光标移至左侧正文即可查看段落详情</div>
                )}
              </section>
              ) : (
              <section className="rounded-2xl bg-zinc-50 p-5 border border-zinc-100/50">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    学习批注
                  </div>
                  <div className="text-[11px] text-zinc-400">{noteCards.length} 条</div>
                </div>
                {noteCards.length ? (
                  <div className="space-y-3">
                    {noteCards.map((noteCard) => (
                      <div
                        key={noteCard.id}
                        data-note-card="compact"
                        className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:border-zinc-200"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div
                              data-note-meta="source"
                              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500"
                            >
                              第 {noteCard.paragraphIdx + 1} 段 · 第 {noteCard.sentenceIdx + 1} 句
                            </div>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-400">
                              note
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteHighlight({
                                paragraphIdx: noteCard.paragraphIdx,
                                sentenceId: noteCard.sentenceId,
                                text: extractNoteHighlightText(noteCard.note) ?? noteCard.enText,
                              });
                              jumpToParagraph(noteCard.paragraphIdx);
                            }}
                            aria-label={`定位到第 ${noteCard.paragraphIdx + 1} 段原文`}
                            className="rounded-full border border-zinc-200 px-2.5 py-1 text-[10px] text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                          >
                            定位原文
                          </button>
                        </div>
                        <div className="mt-3 text-[13px] leading-6 text-zinc-800">{noteCard.note}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-[12px] leading-6 text-zinc-400">
                    还没有可整理的批注，等句子解析补齐后，这里会自动沉淀可回看的学习提醒。
                  </div>
                )}
              </section>
              )}

            </div>
          </div>
        </aside>
      )}

      {popoverPos ? (
        <div
          className="fixed inset-0 z-[100]"
          onMouseDown={() => {
            closeLookup();
          }}
        >
          <div
            className="absolute"
            style={{
              left: clamp(Math.min(200, window.innerWidth / 2), popoverPos.x, Math.max(window.innerWidth - 200, window.innerWidth / 2)),
              ...(popoverPos.top < 350 && window.innerHeight - popoverPos.bottom > popoverPos.top
                ? {
                    top: popoverPos.bottom + 8,
                    transform: "translate(-50%, 0)",
                  }
                : {
                    top: popoverPos.top - 8,
                    transform: "translate(-50%, -100%)",
                  }),
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div 
              className="w-[360px] max-w-[90vw] rounded-2xl border border-amber-100 bg-[#FFFCF2] shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
              style={{
                maxHeight: popoverPos.top < 350 && window.innerHeight - popoverPos.bottom > popoverPos.top
                  ? `calc(100vh - ${popoverPos.bottom + 28}px)`
                  : `calc(${popoverPos.top - 28}px)`,
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
              }}
            >
              <div 
                className="h-6 w-full cursor-grab active:cursor-grabbing flex items-center justify-center shrink-0 border-b border-amber-50"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX - dragOffset.x;
                  const startY = e.clientY - dragOffset.y;
                  
                  const handlePointerMove = (moveEvent: PointerEvent) => {
                    setDragOffset({
                      x: moveEvent.clientX - startX,
                      y: moveEvent.clientY - startY,
                    });
                  };
                  
                  const handlePointerUp = () => {
                    document.removeEventListener("pointermove", handlePointerMove);
                    document.removeEventListener("pointerup", handlePointerUp);
                  };
                  
                  document.addEventListener("pointermove", handlePointerMove);
                  document.addEventListener("pointerup", handlePointerUp);
                }}
              >
                <div className="w-12 h-1 rounded-full bg-amber-200" />
              </div>

              <div className="p-5 overflow-y-auto custom-scrollbar">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-bold text-zinc-900">
                    {lookup?.headword || selectedWord}{" "}
                    <span className="text-sm font-normal text-zinc-500 ml-1">
                      {lookup?.pronunciation?.text || lookup?.phonetic
                        ? `/${lookup?.pronunciation?.text || lookup?.phonetic}/`
                        : ""}
                    </span>
                  </div>
                  {lookup?.headword && selectedWord && lookup.headword !== normalizeSelectedWord(selectedWord) ? (
                    <div className="mt-1 text-xs text-zinc-400">正文词形：{selectedWord}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => speak(lookup?.headword || selectedWord)}
                    aria-pressed={Boolean(speakingText)}
                    aria-label={speakingText ? "停止发音" : "播放发音"}
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70",
                      speakingText
                        ? "bg-emerald-500 text-white hover:bg-emerald-600"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                    ].join(" ")}
                    title={speakingText ? "停止" : "发音"}
                  >
                    {speakingText ? (
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    )}
                  </button>

                  <button
                    onClick={() => void addToVocab()}
                    disabled={vocabStatus === "saving" || vocabStatus === "saved"}
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      vocabStatus === "saved"
                        ? "bg-emerald-100 text-emerald-700"
                        : vocabStatus === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-900 text-white hover:bg-zinc-800",
                    ].join(" ")}
                    title="加入生词本"
                  >
                    {vocabStatus === "saving" ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : vocabStatus === "saved" ? (
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {vocabMessage ? (
                <div
                  className={[
                    "mb-4 rounded-lg px-3 py-2 text-xs",
                    vocabStatus === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
                  ].join(" ")}
                >
                  {vocabMessage}
                </div>
              ) : null}

              {lookupLoading ? (
                <div className="py-6 text-center text-xs text-zinc-400">正在查询词典…</div>
              ) : lookupError ? (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {lookupError}
                </div>
              ) : lookup ? (
                <div className="space-y-4">
                  {lookup.coreMeaning?.gloss ? (
                    <div className="text-sm leading-relaxed text-zinc-800">
                      {lookup.coreMeaning?.gloss}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {lookup.senses?.map((sense, idx) => (
                      <div key={idx}>
                        <div className="text-xs font-semibold text-zinc-500 mb-1">{sense.partOfSpeech}</div>
                        <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-zinc-700">
                          {sense.definitions?.slice(0, 3).map((definition, definitionIndex) => (
                            <li key={definitionIndex}>{definition}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {lookup.examples?.length ? (
                    <div className="space-y-2 mt-4 pt-4 border-t border-amber-100/50">
                      <div className="text-xs font-semibold text-zinc-500 mb-2">例句</div>
                      {lookup.examples.map((ex, idx) => (
                        <div key={idx} className="text-[13px] leading-relaxed text-zinc-600">
                          {ex}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {lookup.mnemonic ? (
                    <div className="rounded-xl bg-amber-50/50 px-4 py-3 text-[13px] leading-relaxed text-zinc-700 border border-amber-100/50">
                      <span className="font-semibold text-amber-800">带你背：</span>
                      {lookup.mnemonic}
                    </div>
                  ) : null}

                  {lookup.morphology?.note ? (
                    <div className="rounded-xl bg-zinc-50/50 px-4 py-3 text-[13px] leading-relaxed text-zinc-600 border border-zinc-100">
                      <span className="font-semibold text-zinc-700">词根词缀：</span>
                      {lookup.morphology.note}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => {
                        window.open(`https://dictionary.cambridge.org/dictionary/english/${lookup.headword || selectedWord}`, "_blank");
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-900 transition-colors"
                    >
                      剑桥词典 ↗
                    </button>
                    <button
                      onClick={() => {
                        window.open(`https://www.collinsdictionary.com/dictionary/english/${lookup.headword || selectedWord}`, "_blank");
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-900 transition-colors"
                    >
                      柯林斯 ↗
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-zinc-400">未找到该词的释义</div>
              )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
