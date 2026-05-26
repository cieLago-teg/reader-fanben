import test from "node:test";
import assert from "node:assert/strict";
import { completeDocumentImport, type ImportWorkflowStore } from "./importWorkflow";

function createStore(): ImportWorkflowStore & {
  updates: Array<{
    documentId: string;
    data: Record<string, unknown>;
  }>;
} {
  return {
    updates: [],
    async updateDocument(documentId, data) {
      this.updates.push({ documentId, data });
    },
  };
}

test("completeDocumentImport marks imported documents ready and queues sentence analysis when assets exist", async () => {
  const store = createStore();
  const createAssetsCalls: Array<{
    documentId: string;
    paragraphs: Array<{ enText: string; zhText: string }>;
  }> = [];
  const analysisCalls: Array<{ documentId: string; mode: "missing" }> = [];

  await completeDocumentImport({
    store,
    documentId: "doc-1",
    translatedParagraphs: [{ enText: "Hello world.", zhText: "你好，世界。" }],
    createAssets: async (documentId, paragraphs) => {
      createAssetsCalls.push({ documentId, paragraphs });
      return {
        paragraphCount: 1,
        sentenceCount: 2,
        analysisStatus: "PENDING",
      };
    },
    startSentenceAnalysis: async (documentId, mode) => {
      analysisCalls.push({ documentId, mode });
    },
  });

  assert.equal(createAssetsCalls.length, 1);
  assert.deepEqual(createAssetsCalls[0], {
    documentId: "doc-1",
    paragraphs: [{ enText: "Hello world.", zhText: "你好，世界。" }],
  });
  assert.equal(store.updates.length, 1);
  assert.equal(store.updates[0]?.documentId, "doc-1");
  assert.equal(store.updates[0]?.data.status, "READY");
  assert.equal(store.updates[0]?.data.analysisStatus, "PENDING");
  assert.equal(store.updates[0]?.data.analysisError, null);
  assert.ok(store.updates[0]?.data.analysisUpdatedAt instanceof Date);
  assert.deepEqual(analysisCalls, [{ documentId: "doc-1", mode: "missing" }]);
});

test("completeDocumentImport marks the document failed when asset creation throws", async () => {
  const store = createStore();
  const analysisCalls: Array<{ documentId: string; mode: "missing" }> = [];

  await assert.rejects(
    () =>
      completeDocumentImport({
        store,
        documentId: "doc-2",
        translatedParagraphs: [{ enText: "Broken input.", zhText: "损坏输入。" }],
        createAssets: async () => {
          throw new Error("asset crash");
        },
        startSentenceAnalysis: async (documentId, mode) => {
          analysisCalls.push({ documentId, mode });
        },
      }),
    /asset crash/,
  );

  assert.equal(store.updates.length, 1);
  assert.equal(store.updates[0]?.documentId, "doc-2");
  assert.equal(store.updates[0]?.data.status, "FAILED");
  assert.equal(store.updates[0]?.data.analysisStatus, "FAILED");
  assert.equal(store.updates[0]?.data.error, "asset crash");
  assert.equal(store.updates[0]?.data.analysisError, "asset crash");
  assert.ok(store.updates[0]?.data.analysisUpdatedAt instanceof Date);
  assert.deepEqual(analysisCalls, []);
});
