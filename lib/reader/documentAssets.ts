export type ReaderContentStatus = "PROCESSING" | "READY" | "FAILED";
export type ReaderAnalysisStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
export type ReaderAnalysisSourceType = "SYSTEM" | "AI" | "MANUAL";

const INLINE_ANNOTATION_COLORS = ["amber", "teal", "violet", "rose", "sky"] as const;

export type SentenceAnalysisChunk = {
  text: string;
  gloss?: string | null;
  role?: string | null;
};

export type SentenceInlineAnnotationColor = (typeof INLINE_ANNOTATION_COLORS)[number];

export type SentenceInlineAnnotation = {
  id: string;
  text: string;
  start: number;
  end: number;
  color: SentenceInlineAnnotationColor;
  label: string;
  detail: string;
  role?: string | null;
};

export type SentenceStructureItem = {
  id?: string;
  label: string;
  detail: string;
  annotationIds?: string[];
};

export type SentenceAnalysisResult = {
  translation: string;
  chunks: SentenceAnalysisChunk[];
  inlineAnnotations?: SentenceInlineAnnotation[];
  structure: SentenceStructureItem[];
  notes: string[];
};

export type SentenceQuestionAnswerStatus = "idle" | "submitting" | "answered" | "error";

export type SentenceQuestionAnswerPayload = {
  scope: "sentence";
  status: SentenceQuestionAnswerStatus;
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

type SegmentParagraphInput = {
  id: string;
  idx: number;
  enText: string;
};

type SentenceAnalysisInput = {
  status: ReaderAnalysisStatus;
  version: number;
  provider?: string | null;
  sourceType: ReaderAnalysisSourceType;
  updatedAt?: Date | null;
  retryCount: number;
  error?: string | null;
  payload?: SentenceAnalysisResult | null;
};

type SentenceInput = {
  id: string;
  idx: number;
  paragraphIdx: number;
  sentenceIdx: number;
  stableKey: string;
  enText: string;
  analysis?: SentenceAnalysisInput | null;
};

type ParagraphInput = {
  id: string;
  idx: number;
  enText: string;
  zhText: string;
  sentences: SentenceInput[];
};

type DocumentDetailInput = {
  document: {
    id: string;
    title: string;
    contentStatus: ReaderContentStatus;
    analysisStatus: ReaderAnalysisStatus;
    sourceType: string;
    sourceUrl?: string | null;
    createdAt: Date;
    analysisUpdatedAt?: Date | null;
  };
  paragraphs: ParagraphInput[];
  progress: { lastParagraphIdx: number; percent: number } | null;
  favored: boolean;
};

type LibraryDocumentItemInput = {
  id: string;
  title: string;
  contentStatus: ReaderContentStatus;
  analysisStatus: ReaderAnalysisStatus;
  createdAt: Date;
  favored: boolean;
  percent: number;
  sentenceCount: number;
  analysisCounts: AnalysisCounts;
};

export type SentenceSeed = {
  paragraphId: string;
  paragraphIdx: number;
  sentenceIdx: number;
  idx: number;
  stableKey: string;
  enText: string;
};

export type AnalysisCounts = {
  total: number;
  ready: number;
  processing: number;
  pending: number;
  failed: number;
};

export function splitParagraphIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  try {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = Array.from(segmenter.segment(normalized))
      .map((s) => s.segment.trim())
      .filter(Boolean);
    return segments.length > 0 ? segments : [normalized];
  } catch (e) {
    // Fallback if Intl.Segmenter is not available in some environments
    const matches = normalized.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [normalized];
    return matches.map((part) => part.trim()).filter(Boolean);
  }
}

function slugifySentence(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");

  return slug || "sentence";
}

export function segmentSentencesForParagraphs(paragraphs: SegmentParagraphInput[]): SentenceSeed[] {
  const sentences: SentenceSeed[] = [];
  let sentenceIdx = 0;

  for (const paragraph of paragraphs) {
    const parts = splitParagraphIntoSentences(paragraph.enText);
    for (let idx = 0; idx < parts.length; idx += 1) {
      const enText = parts[idx];
      sentences.push({
        paragraphId: paragraph.id,
        paragraphIdx: paragraph.idx,
        sentenceIdx: idx,
        idx: sentenceIdx,
        stableKey: `p${paragraph.idx}-s${idx}-${slugifySentence(enText)}`,
        enText,
      });
      sentenceIdx += 1;
    }
  }

  return sentences;
}

function createEmptyAnalysisCounts(): AnalysisCounts {
  return {
    total: 0,
    ready: 0,
    processing: 0,
    pending: 0,
    failed: 0,
  };
}

function buildAnnotationId(index: number) {
  return `annotation-${index + 1}`;
}

function clampAnnotationIndex(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), max));
}

function findChunkRange(sentenceText: string, chunkText: string, fromIndex: number) {
  const source = sentenceText;
  const target = chunkText.trim();
  if (!source || !target) return null;

  const exactStart = source.indexOf(target, fromIndex);
  if (exactStart >= 0) {
    return {
      start: exactStart,
      end: exactStart + target.length,
    };
  }

  const lowercaseStart = source.toLowerCase().indexOf(target.toLowerCase(), fromIndex);
  if (lowercaseStart >= 0) {
    return {
      start: lowercaseStart,
      end: lowercaseStart + target.length,
    };
  }

  return null;
}

function buildInlineAnnotationsFromChunks(
  sentenceText: string,
  chunks: SentenceAnalysisChunk[],
  structure: SentenceStructureItem[],
): SentenceInlineAnnotation[] {
  let cursor = 0;

  return chunks.map((chunk, index) => {
    const derivedId = structure[index]?.id?.trim() || buildAnnotationId(index);
    const range = findChunkRange(sentenceText, chunk.text, cursor) ?? findChunkRange(sentenceText, chunk.text, 0);
    const start = range?.start ?? clampAnnotationIndex(cursor, sentenceText.length);
    const fallbackLength = Math.max(1, chunk.text.trim().length);
    const end = range?.end ?? Math.min(sentenceText.length, start + fallbackLength);

    cursor = Math.max(end, cursor);

    return {
      id: derivedId,
      text: sentenceText.slice(start, end) || chunk.text.trim(),
      start,
      end,
      color: INLINE_ANNOTATION_COLORS[index % INLINE_ANNOTATION_COLORS.length],
      label: chunk.role || `片段 ${index + 1}`,
      detail:
        chunk.gloss ||
        (chunk.role ? `这一段在句中承担“${chunk.role}”作用。` : "结合整句理解这个片段在句中的作用。"),
      role: chunk.role ?? null,
    };
  });
}

export function normalizeSentenceAnalysisResult(
  sentenceText: string,
  result?: SentenceAnalysisResult | null,
): SentenceAnalysisResult | null {
  if (!result) return null;

  const chunks = result.chunks.map((chunk) => ({
    text: chunk.text.trim(),
    gloss: chunk.gloss?.trim() || null,
    role: chunk.role?.trim() || null,
  }));
  const derivedAnnotations =
    result.inlineAnnotations && result.inlineAnnotations.length > 0
      ? result.inlineAnnotations.map((annotation, index) => {
          const maxEnd = sentenceText.length;
          const start = clampAnnotationIndex(annotation.start, maxEnd);
          const end = Math.max(start, clampAnnotationIndex(annotation.end, maxEnd));
          return {
            id: annotation.id.trim() || buildAnnotationId(index),
            text: annotation.text.trim() || sentenceText.slice(start, end),
            start,
            end,
            color: INLINE_ANNOTATION_COLORS.includes(annotation.color) ? annotation.color : INLINE_ANNOTATION_COLORS[index % INLINE_ANNOTATION_COLORS.length],
            label: annotation.label.trim(),
            detail: annotation.detail.trim(),
            role: annotation.role?.trim() || null,
          };
        })
      : buildInlineAnnotationsFromChunks(sentenceText, chunks, result.structure);

  const structureSource = result.structure.length
    ? result.structure
    : derivedAnnotations.map((annotation) => ({
        id: annotation.id,
        label: annotation.label,
        detail: annotation.detail,
        annotationIds: [annotation.id],
      }));

  const structure = structureSource.map((item, index) => ({
    id: item.id?.trim() || derivedAnnotations[index]?.id || buildAnnotationId(index),
    label: item.label.trim(),
    detail: item.detail.trim(),
    annotationIds:
      item.annotationIds?.map((annotationId) => annotationId.trim()).filter(Boolean) ??
      (derivedAnnotations[index] ? [derivedAnnotations[index].id] : []),
  }));

  return {
    translation: result.translation.trim(),
    chunks,
    inlineAnnotations: derivedAnnotations,
    structure,
    notes: result.notes.map((note) => note.trim()).filter(Boolean),
  };
}

export function countSentenceAnalyses(paragraphs: ParagraphInput[]): AnalysisCounts {
  const counts = createEmptyAnalysisCounts();

  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      counts.total += 1;
      const status = sentence.analysis?.status ?? "PENDING";
      if (status === "READY") counts.ready += 1;
      if (status === "PROCESSING") counts.processing += 1;
      if (status === "FAILED") counts.failed += 1;
      if (status === "PENDING") counts.pending += 1;
    }
  }

  return counts;
}

function serializeAnalysis(sentenceText: string, analysis?: SentenceAnalysisInput | null) {
  if (!analysis) {
    return {
      status: "PENDING" as const,
      version: 0,
      provider: null,
      sourceType: "SYSTEM" as const,
      updatedAt: null,
      retryCount: 0,
      error: null,
      canRetry: false,
      result: null,
    };
  }

  return {
    status: analysis.status,
    version: analysis.version,
    provider: analysis.provider ?? null,
    sourceType: analysis.sourceType,
    updatedAt: analysis.updatedAt?.toISOString() ?? null,
    retryCount: analysis.retryCount,
    error: analysis.error ?? null,
    canRetry: analysis.status === "FAILED",
    result: normalizeSentenceAnalysisResult(sentenceText, analysis.payload),
  };
}

function buildSentenceQuestionAnswerPayload(args: {
  documentId: string;
  sentenceId: string;
  stableKey: string;
  expectedVersion: number;
}): SentenceQuestionAnswerPayload {
  return {
    scope: "sentence",
    status: "idle",
    request: {
      path: `/api/documents/${args.documentId}/analysis/questions`,
      method: "POST",
      body: {
        sentenceId: args.sentenceId,
        stableKey: args.stableKey,
        expectedVersion: args.expectedVersion,
        question: "",
        scope: "sentence",
      },
    },
    response: {
      question: "",
      answer: null,
      error: null,
      updatedAt: null,
    },
  };
}

function serializeDocumentStatus(
  contentStatus: ReaderContentStatus,
  analysisStatus: ReaderAnalysisStatus,
) {
  return {
    content: contentStatus,
    analysis: analysisStatus,
    canRead: contentStatus === "READY",
  };
}

export function buildDocumentDetailPayload(input: DocumentDetailInput) {
  const analysisPath = `/api/documents/${input.document.id}/analysis`;
  const paragraphs = input.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    idx: paragraph.idx,
    enText: paragraph.enText,
    zhText: paragraph.zhText,
    sentences: paragraph.sentences.map((sentence) => ({
      id: sentence.id,
      idx: sentence.idx,
      paragraphIdx: sentence.paragraphIdx,
      sentenceIdx: sentence.sentenceIdx,
      stableKey: sentence.stableKey,
      enText: sentence.enText,
      analysis: serializeAnalysis(sentence.enText, sentence.analysis),
      retryAction:
        sentence.analysis?.status === "FAILED"
          ? {
              path: analysisPath,
              method: "POST" as const,
              body: {
                sentenceId: sentence.id,
                mode: "failed" as const,
              },
            }
          : null,
      manualRefineAction: {
        path: analysisPath,
        method: "PATCH" as const,
        body: {
          sentenceId: sentence.id,
          stableKey: sentence.stableKey,
          expectedVersion: sentence.analysis?.version ?? 0,
        },
      },
      questionAnswer: buildSentenceQuestionAnswerPayload({
        documentId: input.document.id,
        sentenceId: sentence.id,
        stableKey: sentence.stableKey,
        expectedVersion: sentence.analysis?.version ?? 0,
      }),
    })),
  }));

  const analysisSummary = countSentenceAnalyses(input.paragraphs);

  return {
    document: {
      id: input.document.id,
      title: input.document.title,
      sourceType: input.document.sourceType,
      sourceUrl: input.document.sourceUrl ?? null,
      createdAt: input.document.createdAt.toISOString(),
      analysisUpdatedAt: input.document.analysisUpdatedAt?.toISOString() ?? null,
      status: serializeDocumentStatus(input.document.contentStatus, input.document.analysisStatus),
      analysisSummary,
      analysisActions: {
        queuePath: analysisPath,
        retryFailedPath: analysisPath,
      },
    },
    paragraphs,
    progress: input.progress,
    favored: input.favored,
  };
}

export function buildLibraryDocumentItem(input: LibraryDocumentItemInput) {
  return {
    id: input.id,
    title: input.title,
    createdAt: input.createdAt.toISOString(),
    favored: input.favored,
    percent: input.percent,
    sentenceCount: input.sentenceCount,
    status: serializeDocumentStatus(input.contentStatus, input.analysisStatus),
    analysisSummary: input.analysisCounts,
  };
}
