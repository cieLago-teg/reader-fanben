import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentDetailPayload,
  buildLibraryDocumentItem,
  normalizeSentenceAnalysisResult,
  segmentSentencesForParagraphs,
} from "./documentAssets";

test("segmentSentencesForParagraphs keeps paragraph linkage and creates stable sentence keys", () => {
  const sentences = segmentSentencesForParagraphs([
    {
      id: "para-1",
      idx: 0,
      enText: 'Hello world. "Stay curious," she said.',
    },
    {
      id: "para-2",
      idx: 1,
      enText: "Another line? Yes!",
    },
  ]);

  assert.equal(sentences.length, 4);
  assert.deepEqual(
    sentences.map((sentence) => ({
      paragraphId: sentence.paragraphId,
      paragraphIdx: sentence.paragraphIdx,
      sentenceIdx: sentence.sentenceIdx,
      text: sentence.enText,
      stableKey: sentence.stableKey,
    })),
    [
      {
        paragraphId: "para-1",
        paragraphIdx: 0,
        sentenceIdx: 0,
        text: "Hello world.",
        stableKey: "p0-s0-hello-world",
      },
      {
        paragraphId: "para-1",
        paragraphIdx: 0,
        sentenceIdx: 1,
        text: '"Stay curious," she said.',
        stableKey: "p0-s1-stay-curious-she-said",
      },
      {
        paragraphId: "para-2",
        paragraphIdx: 1,
        sentenceIdx: 0,
        text: "Another line?",
        stableKey: "p1-s0-another-line",
      },
      {
        paragraphId: "para-2",
        paragraphIdx: 1,
        sentenceIdx: 1,
        text: "Yes!",
        stableKey: "p1-s1-yes",
      },
    ],
  );
});

test("buildDocumentDetailPayload exposes readable content and sentence analysis states separately", () => {
  const payload = buildDocumentDetailPayload({
    document: {
      id: "doc-1",
      title: "A Reader Article",
      contentStatus: "READY",
      analysisStatus: "PROCESSING",
      sourceType: "URL",
      sourceUrl: "https://example.com/article",
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      analysisUpdatedAt: new Date("2026-05-22T12:30:00.000Z"),
    },
    paragraphs: [
      {
        id: "para-1",
        idx: 0,
        enText: "Hello world. Stay curious.",
        zhText: "你好，世界。保持好奇。",
        sentences: [
          {
            id: "sentence-1",
            idx: 0,
            paragraphIdx: 0,
            sentenceIdx: 0,
            stableKey: "p0-s0-hello-world",
            enText: "Hello world.",
            analysis: {
              status: "READY",
              version: 2,
              provider: "gpt-4.1-mini",
              sourceType: "AI",
              updatedAt: new Date("2026-05-22T12:20:00.000Z"),
              retryCount: 1,
              error: null,
              payload: {
                translation: "你好，世界。",
                chunks: [{ text: "Hello world", gloss: "你好，世界", role: "主干" }],
                structure: [
                  {
                    id: "annotation-1",
                    label: "主干",
                    detail: "你好，世界",
                    annotationIds: ["annotation-1"],
                  },
                ],
                notes: ["主句，表达问候。"],
              },
            },
          },
          {
            id: "sentence-2",
            idx: 1,
            paragraphIdx: 0,
            sentenceIdx: 1,
            stableKey: "p0-s1-stay-curious",
            enText: "Stay curious.",
            analysis: {
              status: "FAILED",
              version: 1,
              provider: "gpt-4.1-mini",
              sourceType: "AI",
              updatedAt: new Date("2026-05-22T12:25:00.000Z"),
              retryCount: 2,
              error: "rate limit",
              payload: null,
            },
          },
        ],
      },
    ],
    progress: { lastParagraphIdx: 0, percent: 0.42 },
    favored: true,
  });

  assert.equal(payload.document.status.analysis, "PROCESSING");
  assert.equal(payload.document.status.canRead, true);
  assert.equal(payload.document.analysisSummary.total, 2);
  assert.equal(payload.document.analysisSummary.ready, 1);
  assert.equal(payload.document.analysisSummary.failed, 1);
  assert.equal(payload.document.analysisSummary.processing, 0);
  assert.equal(payload.document.analysisSummary.pending, 0);
  assert.equal(payload.paragraphs[0].sentences[1].analysis?.canRetry, true);
  assert.deepEqual(payload.paragraphs[0].sentences[1].retryAction, {
    path: "/api/documents/doc-1/analysis",
    method: "POST",
    body: {
      sentenceId: "sentence-2",
      mode: "failed",
    },
  });
  assert.equal(payload.paragraphs[0].sentences[0].analysis?.result?.translation, "你好，世界。");
  assert.deepEqual(payload.paragraphs[0].sentences[0].analysis?.result?.inlineAnnotations, [
    {
      id: "annotation-1",
      text: "Hello world",
      start: 0,
      end: 11,
      color: "amber",
      label: "主干",
      detail: "你好，世界",
      role: "主干",
    },
  ]);
  assert.deepEqual(payload.paragraphs[0].sentences[0].manualRefineAction, {
    path: "/api/documents/doc-1/analysis",
    method: "PATCH",
    body: {
      sentenceId: "sentence-1",
      stableKey: "p0-s0-hello-world",
      expectedVersion: 2,
    },
  });
  assert.deepEqual(payload.paragraphs[0].sentences[0].questionAnswer, {
    scope: "sentence",
    status: "idle",
    request: {
      path: "/api/documents/doc-1/analysis/questions",
      method: "POST",
      body: {
        sentenceId: "sentence-1",
        stableKey: "p0-s0-hello-world",
        expectedVersion: 2,
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
  });
});

test("normalizeSentenceAnalysisResult migrates legacy chunks into inline annotations", () => {
  const result = normalizeSentenceAnalysisResult("Although the weather changed, the team kept working.", {
    translation: "尽管天气变了，团队还是继续工作。",
    chunks: [
      { text: "Although the weather changed", gloss: "尽管天气变了", role: "从句" },
      { text: "the team kept working", gloss: "团队还是继续工作", role: "主干" },
    ],
    structure: [{ label: "让步转折", detail: "先读让步背景，再回到真正陈述的主句。" }],
    notes: ["注意 although 先让步、后落主句。"],
  });

  assert.ok(result);
  assert.equal(result?.inlineAnnotations?.length, 2);
  assert.deepEqual(result?.inlineAnnotations?.map((item) => item.color), ["amber", "teal"]);
  assert.deepEqual(result?.structure[0], {
    id: "annotation-1",
    label: "让步转折",
    detail: "先读让步背景，再回到真正陈述的主句。",
    annotationIds: ["annotation-1"],
  });
});

test("buildLibraryDocumentItem surfaces split statuses for list cards", () => {
  const item = buildLibraryDocumentItem({
    id: "doc-1",
    title: "A Reader Article",
    contentStatus: "READY",
    analysisStatus: "PENDING",
    createdAt: new Date("2026-05-22T12:00:00.000Z"),
    favored: false,
    percent: 0.3,
    sentenceCount: 5,
    analysisCounts: {
      total: 5,
      ready: 0,
      processing: 0,
      pending: 5,
      failed: 0,
    },
  });

  assert.deepEqual(item.status, {
    content: "READY",
    analysis: "PENDING",
    canRead: true,
  });
  assert.equal(item.analysisSummary.total, 5);
  assert.equal(item.analysisSummary.pending, 5);
});
