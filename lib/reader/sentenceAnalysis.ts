import { PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { getErrorMessage } from "@/lib/error";
import { translateWithCache } from "@/lib/translate";
import { DeepSeekTranslateProvider } from "@/lib/translate/providers/deepseek";
import type {
  AnalysisCounts,
  ReaderAnalysisStatus,
  SentenceAnalysisResult,
  SentenceInlineAnnotationColor,
} from "./documentAssets";
import { normalizeSentenceAnalysisResult } from "./documentAssets";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

const LOW_VALUE_OBSERVATION_PATTERNS = [
  /先按断句块/,
  /按块理解/,
  /抓主干/,
  /主语/,
  /谓语/,
  /宾语/,
  /一般(?:现在|过去|将来)时/,
  /名词/,
  /动词/,
  /形容词/,
  /副词/,
  /单数/,
  /复数/,
  /第\s*\d+\s*段/,
];

const HIGH_VALUE_OBSERVATION_PATTERNS = [
  /从句/,
  /让步/,
  /转折/,
  /对比/,
  /比较/,
  /修饰/,
  /限定/,
  /插入/,
  /同位语/,
  /倒装/,
  /强调/,
  /逻辑/,
  /语气/,
  /搭配/,
  /省略/,
  /因果/,
  /条件/,
  /信息重心/,
  /市场预期/,
  /隐含/,
  /\balthough\b/i,
  /\bthough\b/i,
  /\bwhile\b/i,
  /\bwhereas\b/i,
  /\bthan\b/i,
  /\brather than\b/i,
  /\binstead of\b/i,
  /\bas if\b/i,
  /\bas though\b/i,
];

function getDeepSeekModel() {
  return process.env.DEEPSEEK_ANALYSIS_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
}

function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of items) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function isSimpleSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const wordCount = normalized ? normalized.split(" ").length : 0;
  return (
    wordCount <= 8 &&
    !/[,:;()]/.test(normalized) &&
    !/\b(although|though|while|whereas|if|when|because|since|unless|after|before|until|than|that|which|who|whom|whose)\b/i.test(
      normalized,
    )
  );
}

function isLowValueObservation(text: string) {
  return LOW_VALUE_OBSERVATION_PATTERNS.some((pattern) => pattern.test(text));
}

function scoreObservation(text: string) {
  let score = 0;
  if (HIGH_VALUE_OBSERVATION_PATTERNS.some((pattern) => pattern.test(text))) {
    score += 4;
  }
  if (/真正|关键|难点|为什么|落在|不是|而是/.test(text)) {
    score += 2;
  }
  if (text.length >= 18 && text.length <= 96) {
    score += 1;
  }
  if (isLowValueObservation(text)) {
    score -= 10;
  }
  return score;
}

function buildObservationNotes(args: {
  sentence: string;
  existingNotes: string[];
  structure: SentenceAnalysisResult["structure"];
  inlineAnnotations: NonNullable<SentenceAnalysisResult["inlineAnnotations"]>;
}) {
  const simpleSentence = isSimpleSentence(args.sentence);
  const candidates = dedupeStrings([
    ...args.existingNotes,
    ...args.structure
      .filter((item) => !/^(直线主句|信息重心)$/.test(item.label))
      .map((item) => `${item.label}：${item.detail}`),
    ...args.inlineAnnotations.map((item) => item.detail),
  ]);

  const filtered = candidates
    .filter((item) => !isLowValueObservation(item))
    .sort((left, right) => scoreObservation(right) - scoreObservation(left));

  const maxNotes = simpleSentence ? 1 : 3;
  const selected = filtered.slice(0, maxNotes);
  if (selected.length > 0) {
    return selected;
  }

  if (simpleSentence) {
    return ["这句语序直接，顺着动作推进即可。"];
  }

  return ["先锁定真正表态的主句，再回看前后信息怎样限制它的语气和范围。"];
}

function refineSentenceAnalysisResult(
  sentence: string,
  result: SentenceAnalysisResult,
): SentenceAnalysisResult {
  const normalized = normalizeSentenceAnalysisResult(sentence, result);
  if (!normalized) {
    return result;
  }

  return {
    ...normalized,
    notes: buildObservationNotes({
      sentence,
      existingNotes: normalized.notes,
      structure: normalized.structure,
      inlineAnnotations: normalized.inlineAnnotations ?? [],
    }),
  };
}

function parseDeepSeekJsonContent(content: string, sentence: string): SentenceAnalysisResult {
  const trimmed = content.trim();
  const normalized = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? normalized.slice(firstBrace, lastBrace + 1)
      : normalized;

  const parsed = JSON.parse(candidate) as Partial<SentenceAnalysisResult>;
  if (
    !parsed ||
    typeof parsed.translation !== "string" ||
    !Array.isArray(parsed.chunks) ||
    !Array.isArray(parsed.notes)
  ) {
    throw new Error("DeepSeek JSON missing required sentence analysis fields");
  }

  return refineSentenceAnalysisResult(sentence, {
    ...(normalizeSentenceAnalysisResult(sentence, {
      translation: parsed.translation,
      chunks: parsed.chunks.map((chunk) => ({
        text: String(chunk?.text ?? "").trim(),
        gloss: chunk?.gloss ? String(chunk.gloss) : null,
        role: chunk?.role ? String(chunk.role) : null,
      })),
      inlineAnnotations: Array.isArray(parsed.inlineAnnotations)
        ? parsed.inlineAnnotations.map((item, index) => ({
            id: String(item?.id ?? `annotation-${index + 1}`).trim(),
            text: String(item?.text ?? "").trim(),
            start: Number(item?.start ?? 0),
            end: Number(item?.end ?? 0),
            color: String(item?.color ?? "amber") as SentenceInlineAnnotationColor,
            label: String(item?.label ?? "").trim(),
            detail: String(item?.detail ?? "").trim(),
            role: item?.role ? String(item.role) : null,
          }))
        : [],
      structure: Array.isArray(parsed.structure)
        ? parsed.structure.map((item) => ({
            id: item?.id ? String(item.id).trim() : undefined,
            label: String(item?.label ?? "").trim(),
            detail: String(item?.detail ?? "").trim(),
            annotationIds: Array.isArray(item?.annotationIds)
              ? item.annotationIds.map((annotationId) => String(annotationId).trim()).filter(Boolean)
              : undefined,
          }))
        : [],
      notes: parsed.notes.map((note) => String(note).trim()).filter(Boolean),
    }) ?? {
      translation: parsed.translation,
      chunks: [],
      inlineAnnotations: [],
      structure: [],
      notes: [],
    }),
  });
}

function isTransientAnalysisError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return [
    "429",
    "408",
    "409",
    "425",
    "500",
    "502",
    "503",
    "504",
    "timeout",
    "timed out",
    "econnreset",
    "socket hang up",
    "network",
    "fetch failed",
    "empty content",
    "failed to parse",
    "json",
  ].some((keyword) => message.includes(keyword));
}

export type SentenceAnalysisMode = "missing" | "failed" | "all";

export type SentenceAnalysisTarget = {
  sentenceId: string;
  enText: string;
  status: ReaderAnalysisStatus;
  retryCount: number;
  error?: string | null;
};

export type SentenceAnalysisGenerator = {
  name: string;
  analyze(sentence: string): Promise<SentenceAnalysisResult>;
};

export interface SentenceAnalysisStore {
  getTargets(args: {
    documentId: string;
    mode: SentenceAnalysisMode;
    sentenceId?: string;
  }): Promise<SentenceAnalysisTarget[]>;
  markProcessing(
    sentenceIds: string[],
    meta: { provider: string; incrementRetry: boolean },
  ): Promise<void>;
  saveSuccess(
    sentenceId: string,
    result: SentenceAnalysisResult,
    meta: { provider: string },
  ): Promise<void>;
  saveFailure(
    sentenceId: string,
    error: string,
    meta: { provider: string },
  ): Promise<void>;
  countByStatus(documentId: string): Promise<AnalysisCounts>;
  updateDocumentStatus(
    documentId: string,
    status: ReaderAnalysisStatus,
    error: string | null,
  ): Promise<void>;
}

type QueueResult = {
  queued: number;
  targets: SentenceAnalysisTarget[];
  counts: AnalysisCounts;
  status: ReaderAnalysisStatus;
};

function createEmptyCounts(): AnalysisCounts {
  return {
    total: 0,
    ready: 0,
    processing: 0,
    pending: 0,
    failed: 0,
  };
}

function inferChunkRole(text: string, idx: number, total: number) {
  const normalized = text.toLowerCase();
  if (/\b(although|though|while|whereas|if|when|because|since)\b/.test(normalized)) {
    return "从句";
  }
  if (idx === 0 && total > 1) {
    return "前置信息";
  }
  if (idx === total - 1 && total > 1) {
    return "结论";
  }
  return "主干";
}

function buildStructureHints(text: string, chunkCount: number) {
  const normalized = text.toLowerCase();
  const hints: { label: string; detail: string }[] = [];

  if (/\b(although|though|while|whereas)\b/.test(normalized)) {
    hints.push({
      label: "让步从句",
      detail: "先承认背景或转折，再回到真正想强调的主句信息。",
    });
  }

  if (/\b(if|when|unless)\b/.test(normalized)) {
    hints.push({
      label: "条件/时间连接",
      detail: "读到连接词后，先圈定条件或时间范围，再找主句动作。",
    });
  }

  if (/\b(because|since|so that)\b/.test(normalized)) {
    hints.push({
      label: "因果关系",
      detail: "一句里同时出现原因和结果时，优先定位结果，再回看原因补充。",
    });
  }

  if (/\b(which|that|who|whom|whose)\b/.test(normalized)) {
    hints.push({
      label: "后置限定",
      detail: "关系词后面的信息通常不是另起新句，而是在继续限定前面的名词或判断。",
    });
  }

  if (/\b(than|as .* as)\b/.test(normalized)) {
    hints.push({
      label: "比较关系",
      detail: "比较结构常把隐含标准藏在后半段，读懂比较对象才能看清作者真正的判断。",
    });
  }

  if (/\b(until|before|after)\b/.test(normalized)) {
    hints.push({
      label: "时间收束",
      detail: "时间连接成分往往补出动作持续到哪里、何时转折或何时收束。",
    });
  }

  if (hints.length === 0 && chunkCount > 1) {
    hints.push({
      label: "信息重心",
      detail: "这句有层次变化，别平均用力，先找真正承担判断的那一段，再回读其余信息。",
    });
  }

  if (hints.length === 0) {
    hints.push({
      label: "直线主句",
      detail: "这句不靠复杂嵌套推进，顺着语序直读即可。",
    });
  }

  return hints;
}

async function buildFallbackSentenceAnalysis(sentence: string, reason: string) {
  try {
    const translator = new DeepSeekTranslateProvider();
    const zhText = await translator.translateParagraph(sentence, { from: "en", to: "zh-CN" });
    const result = buildStructuredSentenceAnalysis(sentence, zhText);
    return {
      ...result,
      notes: [`AI 结构化结果不稳定，已自动切换到保底解析。原因：${reason}`, ...result.notes].slice(0, 3),
    };
  } catch (fallbackError: unknown) {
    throw new Error(
      `AI 解析失败，且保底翻译也失败：${getErrorMessage(fallbackError, reason)}`,
    );
  }
}

export function buildStructuredSentenceAnalysis(
  sentence: string,
  translation: string,
): SentenceAnalysisResult {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  const rawChunks =
    normalized.match(/[^,;:]+(?:[,;:]|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized];
  const chunks = rawChunks.map((chunk, idx) => ({
    text: chunk,
    gloss:
      rawChunks.length === 1
        ? translation
        : `第 ${idx + 1} 段先单独理解，再和整句译文对照。`,
    role: inferChunkRole(chunk, idx, rawChunks.length),
  }));
  const structure = buildStructureHints(normalized, chunks.length);
  const notes = [
    /["“”]/.test(normalized)
      ? "引号部分通常承担原话或立场展示的作用，别把它和作者自己的判断混在一起。"
      : null,
    normalized.split(/\s+/).length >= 16
      ? "长句别平均阅读，先锁定真正落判断的位置，再回收前置和后置补充。"
      : null,
  ].filter((item): item is string => Boolean(item));

  return refineSentenceAnalysisResult(sentence, {
    translation,
    chunks,
    structure,
    notes,
  });
}

export function createDefaultGenerator(): SentenceAnalysisGenerator {
  const provider = (process.env.TRANSLATE_PROVIDER || "deepseek").toLowerCase();

  if (provider === "deepseek") {
    return {
      name: "deepseek-ai",
      async analyze(sentence: string) {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY environment variable");

        const prompt = `
You are an expert reading coach for advanced English learners.
Focus on the 1-3 highest-value observations in the sentence.
Prioritize college-level or above difficulties: clause hierarchy, hidden logic, modification scope, comparison, contrast, rhetoric, register, and advanced collocations.
Do not spend space on elementary grammar such as subject, predicate, tense names, or word-class labeling unless it directly changes meaning.
If the sentence is simple, stay concise instead of inventing filler explanations.

Sentence to analyze:
"${sentence}"

Please return a JSON object with exactly this structure:
{
  "translation": "The full Chinese translation of the sentence",
  "chunks": [
    {
      "text": "The English chunk",
      "gloss": "The Chinese translation/explanation of this chunk",
      "role": "The role of this chunk in the sentence (e.g., 主干, 从句, 前置信息, 结论, 修饰等)"
    }
  ],
  "inlineAnnotations": [
    {
      "id": "annotation-1",
      "text": "The exact text span from the original sentence",
      "start": 0,
      "end": 12,
      "color": "amber",
      "label": "A short structural label",
      "detail": "Explain why this span matters when reading the sentence",
      "role": "主干 / 从句 / 修饰 / 并列 / 强调"
    }
  ],
  "structure": [
    {
      "id": "annotation-1",
      "label": "A short label for a structural feature (e.g., 让步从句, 因果关系)",
      "detail": "A brief explanation of how to read this structure",
      "annotationIds": ["annotation-1"]
    }
  ],
  "notes": [
    "1-3 high-value reading observations only"
  ]
}

Requirements:
- Return 1 to 3 notes at most.
- Let structure and inlineAnnotations carry the explanation load; notes should only capture the most valuable takeaways.
- Prefer observations that explain why the sentence is hard and how to read it.
- Skip low-value elementary grammar commentary.
Ensure the output is strictly valid JSON without any markdown formatting or extra text.
`;

        const res = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: getDeepSeekModel(),
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            response_format: { type: "json_object" }
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`DeepSeek API error (${res.status}): ${errorText}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          return buildFallbackSentenceAnalysis(sentence, "DeepSeek returned empty content");
        }

        try {
          return parseDeepSeekJsonContent(content, sentence);
        } catch (error) {
          return buildFallbackSentenceAnalysis(
            sentence,
            `Failed to parse DeepSeek response as JSON: ${String(content).slice(0, 500)}`,
          );
        }
      },
    };
  }

  return {
    name: "mock-ai",
    async analyze(sentence: string) {
      const { zhText } = await translateWithCache(sentence);
      return buildStructuredSentenceAnalysis(sentence, zhText);
    },
  };
}

export function resolveDocumentAnalysisStatus(counts: AnalysisCounts): ReaderAnalysisStatus {
  if (counts.processing > 0) return "PROCESSING";
  if (counts.pending > 0) return "PENDING";
  if (counts.failed > 0) return "FAILED";
  if (counts.total === 0 || counts.ready === counts.total) return "READY";
  return "FAILED";
}

export async function enqueueSentenceAnalyses(
  store: SentenceAnalysisStore,
  generator: SentenceAnalysisGenerator,
  args: { documentId: string; mode: SentenceAnalysisMode; sentenceId?: string },
): Promise<QueueResult> {
  const targets = await store.getTargets(args);
  if (targets.length === 0) {
    const counts = await store.countByStatus(args.documentId);
    const status = resolveDocumentAnalysisStatus(counts);
    await store.updateDocumentStatus(
      args.documentId,
      status,
      counts.failed > 0 ? "部分句子解析失败，可稍后重试。" : null,
    );
    return { queued: 0, targets: [], counts, status };
  }

  await store.markProcessing(
    targets.map((target) => target.sentenceId),
    {
      provider: generator.name,
      incrementRetry: args.mode !== "missing",
    },
  );
  await store.updateDocumentStatus(args.documentId, "PROCESSING", null);

  const counts = await store.countByStatus(args.documentId);
  return { queued: targets.length, targets, counts, status: "PROCESSING" };
}

export async function finalizeQueuedSentenceAnalyses(
  store: SentenceAnalysisStore,
  generator: SentenceAnalysisGenerator,
  args: { documentId: string; targets: SentenceAnalysisTarget[] },
) {
  const limit = pLimit(5);
  await Promise.all(
    args.targets.map((target) =>
      limit(async () => {
        try {
          // Add a small retry loop for transient errors (e.g. rate limit, JSON parsing)
          let result: SentenceAnalysisResult | null = null;
          let lastError: unknown = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              result = await generator.analyze(target.enText);
              break;
            } catch (err: unknown) {
              lastError = err;
              if (attempt < 3 && isTransientAnalysisError(err)) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                continue;
              }
              break;
            }
          }
          if (!result) throw lastError;

          await store.saveSuccess(target.sentenceId, result, { provider: generator.name });
        } catch (error: unknown) {
          await store.saveFailure(
            target.sentenceId,
            getErrorMessage(error, "句子解析失败"),
            { provider: generator.name },
          );
        }
      })
    )
  );

  const counts = await store.countByStatus(args.documentId);
  const status = resolveDocumentAnalysisStatus(counts);
  await store.updateDocumentStatus(
    args.documentId,
    status,
    counts.failed > 0 ? "部分句子解析失败，可稍后重试。" : null,
  );

  return {
    queued: args.targets.length,
    counts,
    status,
  };
}

export async function processSentenceAnalyses(
  store: SentenceAnalysisStore,
  generator: SentenceAnalysisGenerator,
  args: { documentId: string; mode: SentenceAnalysisMode; sentenceId?: string },
) {
  const queued = await enqueueSentenceAnalyses(store, generator, args);
  if (queued.targets.length === 0) {
    return {
      queued: 0,
      counts: queued.counts,
      status: queued.status,
    };
  }

  return finalizeQueuedSentenceAnalyses(store, generator, {
    documentId: args.documentId,
    targets: queued.targets,
  });
}

class PrismaSentenceAnalysisStore implements SentenceAnalysisStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getTargets({
    documentId,
    mode,
    sentenceId,
  }: {
    documentId: string;
    mode: SentenceAnalysisMode;
    sentenceId?: string;
  }): Promise<SentenceAnalysisTarget[]> {
    const statuses: ReaderAnalysisStatus[] =
      mode === "failed"
        ? ["FAILED"]
        : mode === "all"
          ? ["PENDING", "FAILED"]
          : ["PENDING"];

    const sentences = await this.prisma.sentence.findMany({
      where: {
        documentId,
        ...(sentenceId ? { id: sentenceId } : {}),
        analysis: {
          is: {
            status: { in: statuses },
          },
        },
      },
      include: {
        analysis: true,
      },
      orderBy: {
        idx: "asc",
      },
    });

    return sentences.flatMap((sentence) => {
      if (!sentence.analysis) return [];

      return [
        {
          sentenceId: sentence.id,
          enText: sentence.enText,
          status: sentence.analysis.status,
          retryCount: sentence.analysis.retryCount,
          error: sentence.analysis.error,
        },
      ];
    });
  }

  async markProcessing(
    sentenceIds: string[],
    meta: { provider: string; incrementRetry: boolean },
  ): Promise<void> {
    if (sentenceIds.length === 0) return;
    const now = new Date();
    await this.prisma.$transaction(
      sentenceIds.map((sentenceId) =>
        this.prisma.sentenceAnalysis.update({
          where: { sentenceId },
          data: {
            status: "PROCESSING",
            provider: meta.provider,
            sourceType: "AI",
            error: null,
            requestedAt: now,
            completedAt: null,
            ...(meta.incrementRetry ? { retryCount: { increment: 1 } } : {}),
          },
        }),
      ),
    );
  }

  async saveSuccess(
    sentenceId: string,
    result: SentenceAnalysisResult,
    meta: { provider: string },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.sentenceAnalysis.update({
      where: { sentenceId },
      data: {
        status: "READY",
        provider: meta.provider,
        sourceType: "AI",
        payloadJson: result,
        error: null,
        completedAt: now,
      },
    });
  }

  async saveFailure(
    sentenceId: string,
    error: string,
    meta: { provider: string },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.sentenceAnalysis.update({
      where: { sentenceId },
      data: {
        status: "FAILED",
        provider: meta.provider,
        sourceType: "AI",
        error,
        completedAt: now,
      },
    });
  }

  async countByStatus(documentId: string): Promise<AnalysisCounts> {
    const rows = await this.prisma.sentenceAnalysis.groupBy({
      by: ["status"],
      where: {
        sentence: {
          documentId,
        },
      },
      _count: {
        _all: true,
      },
    });

    const counts = createEmptyCounts();
    for (const row of rows) {
      const count = row._count._all;
      counts.total += count;
      if (row.status === "READY") counts.ready = count;
      if (row.status === "PROCESSING") counts.processing = count;
      if (row.status === "PENDING") counts.pending = count;
      if (row.status === "FAILED") counts.failed = count;
    }

    return counts;
  }

  async updateDocumentStatus(
    documentId: string,
    status: ReaderAnalysisStatus,
    error: string | null,
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        analysisStatus: status,
        analysisError: error,
        analysisUpdatedAt: new Date(),
      },
    });
  }
}

export async function startDocumentSentenceAnalysis(args: {
  documentId: string;
  mode?: SentenceAnalysisMode;
  sentenceId?: string;
}) {
  const mode = args.mode ?? "missing";
  const generator = createDefaultGenerator();
  const initialStore = new PrismaSentenceAnalysisStore(db());
  const queued = await enqueueSentenceAnalyses(initialStore, generator, {
    documentId: args.documentId,
    mode,
    sentenceId: args.sentenceId,
  });

  if (queued.targets.length > 0) {
    queueMicrotask(() => {
      const store = new PrismaSentenceAnalysisStore(db());
      void finalizeQueuedSentenceAnalyses(store, generator, {
        documentId: args.documentId,
        targets: queued.targets,
      }).catch((error: unknown) => {
        console.error("[sentence-analysis]", getErrorMessage(error, "后台句子解析失败"));
      });
    });
  }

  return {
    queued: queued.queued,
    status: queued.status,
    counts: queued.counts,
  };
}
