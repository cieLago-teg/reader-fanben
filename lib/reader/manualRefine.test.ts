import test from "node:test";
import assert from "node:assert/strict";
import {
  ManualRefineConflictError,
  ManualRefineValidationError,
  buildManualRefineUpdate,
  validateManualRefineBody,
} from "./manualRefine";

test("validateManualRefineBody accepts structured sentence analysis payloads", () => {
  const parsed = validateManualRefineBody({
    sentenceId: "sentence-1",
    stableKey: "p1-s0-focused",
    expectedVersion: 2,
    result: {
      translation: "这一段帮助读者保持专注。",
      chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注", role: "主干" }],
        inlineAnnotations: [
          {
            id: "annotation-1",
            text: "keeps the reader focused",
            start: 14,
            end: 38,
            color: "amber",
            label: "主干",
            detail: "先看谓语 keeps，再看宾语补足语。",
            role: "主干",
          },
        ],
        structure: [
          {
            id: "annotation-1",
            label: "主干",
            detail: "先看谓语 keeps，再看宾语补足语。",
            annotationIds: ["annotation-1"],
          },
        ],
      notes: ["先抓主干，再补修饰成分。"],
    },
  });

  assert.equal(parsed.expectedVersion, 2);
  assert.equal(parsed.result.chunks[0]?.role, "主干");
});

test("validateManualRefineBody rejects malformed structured payloads", () => {
  assert.throws(
    () =>
      validateManualRefineBody({
        sentenceId: "sentence-1",
        stableKey: "p1-s0-focused",
        expectedVersion: 2,
        result: {
          translation: "",
          chunks: [],
          inlineAnnotations: [],
          structure: [],
          notes: [],
        },
      }),
    ManualRefineValidationError,
  );
});

test("validateManualRefineBody rejects malformed inline annotations", () => {
  assert.throws(
    () =>
      validateManualRefineBody({
        sentenceId: "sentence-1",
        stableKey: "p1-s0-focused",
        expectedVersion: 2,
        result: {
          translation: "这一段帮助读者保持专注。",
          chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注", role: "主干" }],
          inlineAnnotations: [
            {
              id: "annotation-1",
              text: "keeps the reader focused",
              start: 30,
              end: 12,
              color: "amber",
              label: "主干",
              detail: "end 比 start 小。",
              role: "主干",
            },
          ],
          structure: [],
          notes: ["note"],
        },
      }),
    ManualRefineValidationError,
  );
});

test("buildManualRefineUpdate increments version and marks the analysis as manual", () => {
  const update = buildManualRefineUpdate({
    currentStableKey: "p1-s0-focused",
    currentSentenceText: "Paragraph one keeps the reader focused.",
    currentVersion: 3,
    provider: "deepseek-ai",
    body: validateManualRefineBody({
      sentenceId: "sentence-1",
      stableKey: "p1-s0-focused",
      expectedVersion: 3,
      result: {
        translation: "这一段帮助读者保持专注。",
        chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注", role: "主干" }],
        inlineAnnotations: [
          {
            id: "annotation-1",
            text: "keeps the reader focused",
            start: 14,
            end: 38,
            color: "amber",
            label: "主干",
            detail: "核心谓语表达作用。",
            role: "主干",
          },
        ],
        structure: [
          {
            id: "annotation-1",
            label: "主干",
            detail: "核心谓语表达作用。",
            annotationIds: ["annotation-1"],
          },
        ],
        notes: ["先抓主干，再回看宾语补足语。"],
      },
    }),
  });

  assert.equal(update.version, 4);
  assert.equal(update.status, "READY");
  assert.equal(update.sourceType, "MANUAL");
  assert.equal(update.provider, "manual-refine");
  assert.equal(update.retryCount, 0);
  assert.equal(update.payloadJson.translation, "这一段帮助读者保持专注。");
  assert.equal(update.payloadJson.inlineAnnotations?.[0]?.text, "keeps the reader focused");
});

test("buildManualRefineUpdate rejects version conflicts and stable key mismatches", () => {
  assert.throws(
    () =>
      buildManualRefineUpdate({
        currentStableKey: "p1-s0-focused",
        currentSentenceText: "Paragraph one keeps the reader focused.",
        currentVersion: 3,
        provider: "deepseek-ai",
        body: validateManualRefineBody({
          sentenceId: "sentence-1",
          stableKey: "p1-s0-other",
          expectedVersion: 3,
          result: {
            translation: "译文",
            chunks: [{ text: "chunk", gloss: "释义", role: "主干" }],
            structure: [{ id: "annotation-1", label: "主干", detail: "detail", annotationIds: ["annotation-1"] }],
            notes: ["note"],
          },
        }),
      }),
    ManualRefineConflictError,
  );

  assert.throws(
    () =>
      buildManualRefineUpdate({
        currentStableKey: "p1-s0-focused",
        currentSentenceText: "Paragraph one keeps the reader focused.",
        currentVersion: 4,
        provider: "deepseek-ai",
        body: validateManualRefineBody({
          sentenceId: "sentence-1",
          stableKey: "p1-s0-focused",
          expectedVersion: 3,
          result: {
            translation: "译文",
            chunks: [{ text: "chunk", gloss: "释义", role: "主干" }],
            structure: [{ id: "annotation-1", label: "主干", detail: "detail", annotationIds: ["annotation-1"] }],
            notes: ["note"],
          },
        }),
      }),
    ManualRefineConflictError,
  );
});
