import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuredSentenceAnalysis,
  createDefaultGenerator,
  processSentenceAnalyses,
  type SentenceAnalysisGenerator,
  type SentenceAnalysisStore,
  type SentenceAnalysisTarget,
} from "./sentenceAnalysis";

type MemoryAnalysisRecord = {
  sentenceId: string;
  enText: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  retryCount: number;
  error: string | null;
  provider: string | null;
  payload: ReturnType<typeof buildStructuredSentenceAnalysis> | null;
};

class MemorySentenceAnalysisStore implements SentenceAnalysisStore {
  readonly documentId: string;
  readonly records = new Map<string, MemoryAnalysisRecord>();
  documentStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED" = "PENDING";
  documentError: string | null = null;

  constructor(documentId: string, targets: SentenceAnalysisTarget[]) {
    this.documentId = documentId;
    for (const target of targets) {
      this.records.set(target.sentenceId, {
        sentenceId: target.sentenceId,
        enText: target.enText,
        status: target.status,
        retryCount: target.retryCount,
        error: target.error ?? null,
        provider: null,
        payload: null,
      });
    }
  }

  async getTargets({
    documentId,
    mode,
    sentenceId,
  }: {
    documentId: string;
    mode: "missing" | "failed" | "all";
    sentenceId?: string;
  }): Promise<SentenceAnalysisTarget[]> {
    assert.equal(documentId, this.documentId);
    const items = Array.from(this.records.values());
    return items
      .filter((item) => (sentenceId ? item.sentenceId === sentenceId : true))
      .filter((item) => {
        if (mode === "all") return item.status !== "PROCESSING";
        if (mode === "failed") return item.status === "FAILED";
        return item.status === "PENDING";
      })
      .map((item) => ({
        sentenceId: item.sentenceId,
        enText: item.enText,
        status: item.status,
        retryCount: item.retryCount,
        error: item.error,
      }));
  }

  async markProcessing(
    sentenceIds: string[],
    meta: { provider: string; incrementRetry: boolean },
  ): Promise<void> {
    for (const sentenceId of sentenceIds) {
      const current = this.records.get(sentenceId);
      assert.ok(current);
      current.status = "PROCESSING";
      current.provider = meta.provider;
      current.error = null;
      if (meta.incrementRetry) {
        current.retryCount += 1;
      }
    }
  }

  async saveSuccess(
    sentenceId: string,
    result: ReturnType<typeof buildStructuredSentenceAnalysis>,
    meta: { provider: string },
  ): Promise<void> {
    const current = this.records.get(sentenceId);
    assert.ok(current);
    current.status = "READY";
    current.provider = meta.provider;
    current.error = null;
    current.payload = result;
  }

  async saveFailure(
    sentenceId: string,
    error: string,
    meta: { provider: string },
  ): Promise<void> {
    const current = this.records.get(sentenceId);
    assert.ok(current);
    current.status = "FAILED";
    current.provider = meta.provider;
    current.error = error;
  }

  async countByStatus(documentId: string) {
    assert.equal(documentId, this.documentId);
    const counts = {
      total: this.records.size,
      ready: 0,
      processing: 0,
      pending: 0,
      failed: 0,
    };

    for (const record of this.records.values()) {
      if (record.status === "READY") counts.ready += 1;
      if (record.status === "PROCESSING") counts.processing += 1;
      if (record.status === "PENDING") counts.pending += 1;
      if (record.status === "FAILED") counts.failed += 1;
    }

    return counts;
  }

  async updateDocumentStatus(
    documentId: string,
    status: "PENDING" | "PROCESSING" | "READY" | "FAILED",
    error: string | null,
  ): Promise<void> {
    assert.equal(documentId, this.documentId);
    this.documentStatus = status;
    this.documentError = error;
  }
}

test("buildStructuredSentenceAnalysis returns chunks, structure hints and takeaway notes", () => {
  const result = buildStructuredSentenceAnalysis(
    "Although the weather changed, the team kept working until sunset.",
    "尽管天气变了，团队还是一直工作到日落。",
  );

  assert.equal(result.translation, "尽管天气变了，团队还是一直工作到日落。");
  assert.ok(result.chunks.length >= 2);
  assert.ok(result.inlineAnnotations?.length >= 2);
  assert.ok(result.structure.length >= 1);
  assert.ok(result.notes.length >= 1);
  assert.match(result.structure[0]?.label ?? "", /从句|主干|连接/);
  assert.ok(result.structure[0]?.annotationIds?.length);
});

test("buildStructuredSentenceAnalysis favors high-value structure cues over generic chunk-reading advice", () => {
  const result = buildStructuredSentenceAnalysis(
    "Although investors remained cautious, the company raised guidance after demand proved more resilient than analysts had expected.",
    "尽管投资者仍然谨慎，但由于需求表现比分析师预期更有韧性，这家公司还是上调了业绩指引。",
  );

  assert.ok(result.inlineAnnotations?.length >= 2);
  assert.ok(result.structure.length >= 1);
  assert.equal(result.notes.length <= 3, true);
  assert.equal(
    result.structure.some((item) => /分块阅读|主干句/.test(item.label)),
    false,
  );
  assert.equal(
    result.notes.some((note) => /先按断句块|抓主干|主语|谓语/.test(note)),
    false,
  );
});

test("processSentenceAnalyses completes pending sentences and marks the document ready", async () => {
  const store = new MemorySentenceAnalysisStore("doc-1", [
    { sentenceId: "s-1", enText: "Stay curious.", status: "PENDING", retryCount: 0 },
    { sentenceId: "s-2", enText: "Keep building.", status: "PENDING", retryCount: 0 },
  ]);

  const generator: SentenceAnalysisGenerator = {
    name: "mock-ai",
    analyze(sentence) {
      return Promise.resolve(
        buildStructuredSentenceAnalysis(sentence, `译文：${sentence}`),
      );
    },
  };

  const result = await processSentenceAnalyses(store, generator, {
    documentId: "doc-1",
    mode: "missing",
  });

  assert.equal(result.queued, 2);
  assert.equal(result.counts.ready, 2);
  assert.equal(result.counts.failed, 0);
  assert.equal(result.status, "READY");
  assert.equal(store.documentStatus, "READY");
  assert.equal(store.records.get("s-1")?.payload?.translation, "译文：Stay curious.");
});

test("processSentenceAnalyses retries failed sentences and keeps failed state when retry still errors", async () => {
  const store = new MemorySentenceAnalysisStore("doc-2", [
    { sentenceId: "s-1", enText: "This one still fails.", status: "FAILED", retryCount: 2, error: "timeout" },
    { sentenceId: "s-2", enText: "Already ready.", status: "READY", retryCount: 0 },
  ]);

  const generator: SentenceAnalysisGenerator = {
    name: "mock-ai",
    async analyze(sentence) {
      if (sentence.includes("fails")) {
        throw new Error("rate limit");
      }
      return buildStructuredSentenceAnalysis(sentence, `译文：${sentence}`);
    },
  };

  const result = await processSentenceAnalyses(store, generator, {
    documentId: "doc-2",
    mode: "failed",
  });

  assert.equal(result.queued, 1);
  assert.equal(result.counts.ready, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.status, "FAILED");
  assert.equal(store.documentStatus, "FAILED");
  assert.equal(store.records.get("s-1")?.retryCount, 3);
  assert.equal(store.records.get("s-1")?.error, "rate limit");
});

test("createDefaultGenerator uses the configured DeepSeek model", async () => {
  const originalProvider = process.env.TRANSLATE_PROVIDER;
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  const originalTranslateModel = process.env.DEEPSEEK_TRANSLATE_MODEL;
  const originalFetch = globalThis.fetch;

  process.env.TRANSLATE_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "deepseek-custom-model";

  let requestedModel: string | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requestedModel = body.model;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translation: "译文",
                chunks: [{ text: "chunk", gloss: "释义", role: "主干" }],
                structure: [{ id: "annotation-1", label: "结构", detail: "说明", annotationIds: ["annotation-1"] }],
                notes: ["提示"],
              }),
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const generator = createDefaultGenerator();
    const result = await generator.analyze("A sentence.");

    assert.equal(requestedModel, "deepseek-custom-model");
    assert.equal(result.translation, "译文");
    assert.equal(result.inlineAnnotations?.[0]?.label, "主干");
  } finally {
    process.env.TRANSLATE_PROVIDER = originalProvider;
    process.env.DEEPSEEK_API_KEY = originalApiKey;
    process.env.DEEPSEEK_MODEL = originalModel;
    process.env.DEEPSEEK_TRANSLATE_MODEL = originalTranslateModel;
    globalThis.fetch = originalFetch;
  }
});

test("createDefaultGenerator falls back to translation when DeepSeek returns malformed JSON", async () => {
  const originalProvider = process.env.TRANSLATE_PROVIDER;
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  const originalTranslateModel = process.env.DEEPSEEK_TRANSLATE_MODEL;
  const originalFetch = globalThis.fetch;

  process.env.TRANSLATE_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "deepseek-analysis-model";
  process.env.DEEPSEEK_TRANSLATE_MODEL = "deepseek-translate-model";

  const requestedModels: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requestedModels.push(body.model);

    if (requestedModels.length === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Sure, here's the analysis in prose instead of JSON.",
              },
            },
          ],
        }),
      } as Response;
    }

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "回退译文",
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const generator = createDefaultGenerator();
    const result = await generator.analyze("Fallback sentence.");

    assert.deepEqual(requestedModels, ["deepseek-analysis-model", "deepseek-translate-model"]);
    assert.equal(result.translation, "回退译文");
    assert.ok(result.chunks.length >= 1);
    assert.ok(result.inlineAnnotations?.length);
    assert.ok(result.notes.length >= 1);
  } finally {
    process.env.TRANSLATE_PROVIDER = originalProvider;
    process.env.DEEPSEEK_API_KEY = originalApiKey;
    process.env.DEEPSEEK_MODEL = originalModel;
    process.env.DEEPSEEK_TRANSLATE_MODEL = originalTranslateModel;
    globalThis.fetch = originalFetch;
  }
});

test("createDefaultGenerator trims low-value grammar notes and keeps only 1-3 high-value observations", async () => {
  const originalProvider = process.env.TRANSLATE_PROVIDER;
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  const originalFetch = globalThis.fetch;

  process.env.TRANSLATE_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "deepseek-analysis-model";

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.equal(body.model, "deepseek-analysis-model");

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translation: "尽管市场情绪谨慎，但公司还是上调了预期。",
                chunks: [
                  { text: "Although investors remained cautious,", gloss: "尽管投资者仍然谨慎，", role: "从句" },
                  {
                    text: "the company raised guidance after demand proved more resilient than analysts had expected.",
                    gloss: "但由于需求比分析师预期更有韧性，公司上调了业绩指引。",
                    role: "主干",
                  },
                ],
                inlineAnnotations: [
                  {
                    id: "annotation-1",
                    text: "Although investors remained cautious",
                    start: 0,
                    end: 36,
                    color: "amber",
                    label: "让步背景",
                    detail: "先让步交代市场情绪，真正判断落在后面的主句动作。",
                    role: "从句",
                  },
                  {
                    id: "annotation-2",
                    text: "more resilient than analysts had expected",
                    start: 72,
                    end: 114,
                    color: "teal",
                    label: "隐含对比",
                    detail: "than 从句把“实际需求”与“分析师预期”拉出对比，是上调指引的依据。",
                    role: "修饰",
                  },
                ],
                structure: [
                  {
                    id: "annotation-1",
                    label: "让步转主结论",
                    detail: "句子先压低预期，再把真正结论放到主句，语气上更显反差。",
                    annotationIds: ["annotation-1"],
                  },
                  {
                    id: "annotation-2",
                    label: "比较从句",
                    detail: "than analysts had expected 不是重复信息，而是解释为什么 management 能提高指引。",
                    annotationIds: ["annotation-2"],
                  },
                ],
                notes: [
                  "这里的主语是 the company。",
                  "谓语是 raised guidance。",
                  "使用了一般过去时。",
                  "让步从句先压住市场背景，真正要读的判断落在主句动作 raised guidance 上。",
                  "than analysts had expected 补出了一个隐含对比，让 more resilient 不只是“更强”，而是“强于市场预期”。",
                ],
              }),
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const generator = createDefaultGenerator();
    const result = await generator.analyze(
      "Although investors remained cautious, the company raised guidance after demand proved more resilient than analysts had expected.",
    );

    assert.ok(result.inlineAnnotations?.length >= 2);
    assert.equal(result.notes.length <= 3, true);
    assert.equal(
      result.notes.some((note) => /主语|谓语|一般过去时/.test(note)),
      false,
    );
    assert.equal(
      result.notes.some((note) => /让步从句|隐含对比|市场预期/.test(note)),
      true,
    );
  } finally {
    process.env.TRANSLATE_PROVIDER = originalProvider;
    process.env.DEEPSEEK_API_KEY = originalApiKey;
    process.env.DEEPSEEK_MODEL = originalModel;
    globalThis.fetch = originalFetch;
  }
});

test("processSentenceAnalyses retries transient 503 failures before marking success", async () => {
  const store = new MemorySentenceAnalysisStore("doc-3", [
    { sentenceId: "s-1", enText: "Transient error sentence.", status: "PENDING", retryCount: 0 },
  ]);

  let attempts = 0;
  const generator: SentenceAnalysisGenerator = {
    name: "deepseek-ai",
    async analyze(sentence) {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("DeepSeek API error (503): upstream overloaded");
      }
      return buildStructuredSentenceAnalysis(sentence, `译文：${sentence}`);
    },
  };

  const result = await processSentenceAnalyses(store, generator, {
    documentId: "doc-3",
    mode: "missing",
  });

  assert.equal(attempts, 3);
  assert.equal(result.status, "READY");
  assert.equal(store.records.get("s-1")?.status, "READY");
});
