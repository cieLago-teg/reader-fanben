import assert from "node:assert/strict";
import test from "node:test";
import {
  answerSentenceQuestion,
  buildSentenceQuestionPrompt,
  validateSentenceQuestionBody,
} from "./sentenceQuestionAnswer";

test("validateSentenceQuestionBody trims valid payloads and rejects empty questions", () => {
  const parsed = validateSentenceQuestionBody({
    sentenceId: "sentence-1",
    stableKey: "p1-s0-focused",
    expectedVersion: 2,
    question: "  这里为什么用 focused？  ",
    scope: "sentence",
  });

  assert.equal(parsed.question, "这里为什么用 focused？");

  assert.throws(
    () =>
      validateSentenceQuestionBody({
        sentenceId: "sentence-1",
        stableKey: "p1-s0-focused",
        expectedVersion: 2,
        question: "   ",
        scope: "sentence",
      }),
  );
});

test("buildSentenceQuestionPrompt includes the current sentence, analysis context, and user question", () => {
  const prompt = buildSentenceQuestionPrompt({
    question: "这里为什么用 focused？",
    context: {
      sentenceText: "Paragraph one keeps the reader focused.",
      paragraphText: "Paragraph one keeps the reader focused.",
      paragraphTranslation: "第一段帮助读者保持专注。",
      analysis: {
        translation: "这一段帮助读者保持专注。",
        chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注", role: "主干" }],
        inlineAnnotations: [
          {
            id: "annotation-main",
            text: "keeps the reader focused",
            start: 14,
            end: 38,
            color: "amber",
            label: "主干",
            detail: "核心谓语 keeps 搭配宾语补足语 focused。",
            role: "主干",
          },
        ],
        structure: [
          {
            id: "annotation-main",
            label: "主干推进",
            detail: "先抓 keeps，再把 focused 当成补足语一起理解。",
            annotationIds: ["annotation-main"],
          },
        ],
        notes: ["先抓主干，再回看宾语补足语。"],
      },
    },
  });

  assert.match(prompt, /Paragraph one keeps the reader focused\./);
  assert.match(prompt, /主释义：这一段帮助读者保持专注。/);
  assert.match(prompt, /主干: "keeps the reader focused"/);
  assert.match(prompt, /用户问题：这里为什么用 focused？/);
});

test("answerSentenceQuestion calls DeepSeek with sentence context and returns a trimmed answer", async () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalQaModel = process.env.DEEPSEEK_QA_MODEL;
  const originalModel = process.env.DEEPSEEK_MODEL;

  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.DEEPSEEK_QA_MODEL;
  process.env.DEEPSEEK_MODEL = "deepseek-reader-qa";

  let requestedModel: string | null = null;
  let userPrompt = "";

  try {
    const result = await answerSentenceQuestion({
      question: "这里为什么用 focused？",
      context: {
        sentenceText: "Paragraph one keeps the reader focused.",
        paragraphText: "Paragraph one keeps the reader focused.",
        paragraphTranslation: "第一段帮助读者保持专注。",
        analysis: {
          translation: "这一段帮助读者保持专注。",
          chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注", role: "主干" }],
          inlineAnnotations: [
            {
              id: "annotation-main",
              text: "keeps the reader focused",
              start: 14,
              end: 38,
              color: "amber",
              label: "主干",
              detail: "核心谓语 keeps 搭配宾语补足语 focused。",
              role: "主干",
            },
          ],
          structure: [
            {
              id: "annotation-main",
              label: "主干推进",
              detail: "先抓 keeps，再把 focused 当成补足语一起理解。",
              annotationIds: ["annotation-main"],
            },
          ],
          notes: ["先抓主干，再回看宾语补足语。"],
        },
      },
      now: () => new Date("2026-05-23T08:00:00.000Z"),
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedModel = body.model;
        userPrompt = body.messages?.[1]?.content ?? "";

        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "  focused 在这里是宾语补足语，说明 reader 被保持在什么状态。  ",
                },
              },
            ],
          }),
        } as Response;
      }) as typeof fetch,
    });

    assert.equal(requestedModel, "deepseek-reader-qa");
    assert.match(userPrompt, /用户问题：这里为什么用 focused？/);
    assert.equal(result.answer, "focused 在这里是宾语补足语，说明 reader 被保持在什么状态。");
    assert.equal(result.updatedAt, "2026-05-23T08:00:00.000Z");
  } finally {
    process.env.DEEPSEEK_API_KEY = originalApiKey;
    process.env.DEEPSEEK_QA_MODEL = originalQaModel;
    process.env.DEEPSEEK_MODEL = originalModel;
  }
});
