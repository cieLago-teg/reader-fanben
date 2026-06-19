import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot, type Root } from "react-dom/client";
import { ReaderClient } from "../../app/reader/[docId]/ReaderClient";

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
          chunks: { text: string; gloss?: string | null }[];
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
        method: string;
        body: Record<string, unknown>;
      } | null;
      manualRefineAction?: {
        path: string;
        method: string;
        body: Record<string, unknown>;
      } | null;
      questionAnswer?: {
        scope: "sentence";
        status: "idle" | "submitting" | "answered" | "error";
        request: {
          path: string;
          method: string;
          body: Record<string, unknown>;
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

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };
type ReaderFetch = <T>(input: RequestInfo | URL, init?: RequestInit) => Promise<ApiResponse<T>>;

type TestEnv = {
  container: HTMLDivElement;
  root: Root;
  requests: { input: RequestInfo | URL; init?: RequestInit }[];
  scrollCalls: string[];
  intervalCallbacks: Array<() => void>;
  cleanup: () => void;
};

function waitForImmediate() {
  return new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  textarea.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function countOccurrences(text: string, needle: string) {
  return text.split(needle).length - 1;
}

const originalGlobals = {
  window: globalThis.window,
  self: (globalThis as typeof globalThis & { self?: Window & typeof globalThis }).self,
  document: globalThis.document,
  navigator: globalThis.navigator,
  HTMLElement: globalThis.HTMLElement,
  Event: globalThis.Event,
  MouseEvent: globalThis.MouseEvent,
  Node: globalThis.Node,
  localStorage: globalThis.localStorage,
  IntersectionObserver: globalThis.IntersectionObserver,
  SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  reactActEnvironment: (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT,
};

function createPayload(): DocPayload {
  return {
    document: {
      id: "doc-1",
      title: "Deep Work Notes",
      sourceType: "URL",
      sourceUrl: "https://example.com/deep-work",
      createdAt: "2026-05-22T12:00:00.000Z",
      analysisUpdatedAt: "2026-05-22T12:30:00.000Z",
      status: {
        content: "READY",
        analysis: "FAILED",
        canRead: true,
      },
      analysisSummary: {
        total: 2,
        ready: 1,
        processing: 0,
        pending: 0,
        failed: 1,
      },
      analysisActions: {
        queuePath: "/api/documents/doc-1/analysis",
        retryFailedPath: "/api/documents/doc-1/analysis",
      },
    },
    paragraphs: [
      {
        id: "para-0",
        idx: 0,
        enText: "Paragraph zero in English.",
        zhText: "第零段中文。",
        sentences: [],
      },
      {
        id: "para-1",
        idx: 1,
        enText: "Paragraph one keeps the reader focused.",
        zhText: "第一段帮助读者保持专注。",
        sentences: [
          {
            id: "sentence-1",
            idx: 0,
            paragraphIdx: 1,
            sentenceIdx: 0,
            stableKey: "p1-s0-focused",
            enText: "Paragraph one keeps the reader focused.",
            analysis: {
              status: "READY",
              version: 1,
              provider: "mock",
              sourceType: "MANUAL",
              updatedAt: "2026-05-22T12:31:00.000Z",
              retryCount: 0,
              error: null,
              canRetry: false,
              result: {
                translation: "这一段帮助读者保持专注。",
                chunks: [{ text: "keeps the reader focused", gloss: "让读者保持专注" }],
                inlineAnnotations: [
                  {
                    id: "annotation-main",
                    text: "keeps the reader focused",
                    start: 14,
                    end: 38,
                    color: "amber",
                    label: "主干",
                    detail: "核心谓语 keeps 搭配宾语补足语 focused，直接交代这一段的作用。",
                    role: "主干",
                  },
                  {
                    id: "annotation-object",
                    text: "the reader focused",
                    start: 20,
                    end: 38,
                    color: "teal",
                    label: "宾补",
                    detail: "focused 不是单独形容词，而是补足语，说明让 reader 处于什么状态。",
                    role: "补足语",
                  },
                ],
                structure: [
                  {
                    id: "annotation-main",
                    label: "主干推进",
                    detail: "先抓谓语 keeps，再把宾语补足语一起读进去，句意就完整了。",
                    annotationIds: ["annotation-main"],
                  },
                  {
                    id: "annotation-object",
                    label: "宾语补足语",
                    detail: "focused 补充 reader 的状态，是理解句意的关键结构，不要拆散。",
                    annotationIds: ["annotation-object"],
                  },
                ],
                notes: ["先抓主干 keep，再补充宾语 the reader focused。"],
              },
            },
            manualRefineAction: {
              path: "/api/documents/doc-1/analysis",
              method: "PATCH",
              body: {
                sentenceId: "sentence-1",
                stableKey: "p1-s0-focused",
                expectedVersion: 1,
              },
            },
            questionAnswer: {
              scope: "sentence",
              status: "idle",
              request: {
                path: "/api/documents/doc-1/analysis/questions",
                method: "POST",
                body: {
                  sentenceId: "sentence-1",
                  stableKey: "p1-s0-focused",
                  expectedVersion: 1,
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
            },
          },
        ],
      },
      {
        id: "para-2",
        idx: 2,
        enText: "Paragraph two adds more context for the reading rail.",
        zhText: "第二段为阅读侧栏补充上下文。",
        sentences: [
          {
            id: "sentence-2",
            idx: 0,
            paragraphIdx: 2,
            sentenceIdx: 0,
            stableKey: "p2-s0-context",
            enText: "Paragraph two adds more context for the reading rail.",
            analysis: {
              status: "FAILED",
              version: 1,
              provider: "mock",
              sourceType: "AI",
              updatedAt: "2026-05-22T12:36:00.000Z",
              retryCount: 1,
              error: "rate limit",
              canRetry: true,
              result: null,
            },
            retryAction: {
              path: "/api/documents/doc-1/analysis",
              method: "POST",
              body: {
                sentenceId: "sentence-2",
                mode: "failed",
              },
            },
          },
        ],
      },
    ],
    progress: { lastParagraphIdx: 1, percent: 0.5 },
    favored: false,
  };
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.com/reader/doc-1",
  });

  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "self", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "Event", { configurable: true, value: dom.window.Event });
  Object.defineProperty(globalThis, "MouseEvent", { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, "Node", { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: dom.window.localStorage });
}

function installBrowserMocks(scrollCalls: string[]) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  class MockIntersectionObserver {
    observe() {}

    disconnect() {}
  }

  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: MockIntersectionObserver,
  });

  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class MockSpeechSynthesisUtterance {
      lang = "";
      text: string;

      constructor(text: string) {
        this.text = text;
      }
    },
  });

  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      cancel() {},
      speak() {},
    },
  });

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440,
  });

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900,
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: () => {},
  });

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: window.requestAnimationFrame,
  });

  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: window.cancelAnimationFrame,
  });

  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function scrollIntoView() {
      const idx = (this as HTMLElement).dataset.idx;
      const target = (this as HTMLElement).dataset.scrollTarget;
      if (idx) scrollCalls.push(idx);
      if (target) scrollCalls.push(target);
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function getBoundingClientRect() {
      const idx = Number((this as HTMLElement).dataset.idx ?? -1);
      const topMap = new Map<number, number>([
        [0, 560],
        [1, 180],
        [2, 420],
      ]);
      const top = topMap.get(idx) ?? 0;
      return {
        x: 0,
        y: top,
        width: 640,
        height: 80,
        top,
        left: 0,
        right: 640,
        bottom: top + 80,
        toJSON() {
          return this;
        },
      };
    },
  });
}

function installIntervalMocks(intervalCallbacks: Array<() => void>) {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();

  const setIntervalMock = (callback: TimerHandler) => {
    const id = nextId++;
    if (typeof callback === "function") {
      callbacks.set(id, callback as () => void);
      intervalCallbacks.push(callback as () => void);
    }
    return id as unknown as ReturnType<typeof setInterval>;
  };

  const clearIntervalMock = (id?: ReturnType<typeof setInterval>) => {
    callbacks.delete(Number(id));
  };

  Object.defineProperty(globalThis, "setInterval", {
    configurable: true,
    value: setIntervalMock,
  });
  Object.defineProperty(globalThis, "clearInterval", {
    configurable: true,
    value: clearIntervalMock,
  });
  Object.defineProperty(window, "setInterval", {
    configurable: true,
    value: setIntervalMock,
  });
  Object.defineProperty(window, "clearInterval", {
    configurable: true,
    value: clearIntervalMock,
  });
}

function createFetch(payload: DocPayload | DocPayload[], requests: TestEnv["requests"]): ReaderFetch {
  const documentResponses = Array.isArray(payload) ? [...payload] : [payload];
  let documentFetchCount = 0;

  return async <T,>(input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init });
    const path = String(input);

    if (path === "/api/documents/doc-1") {
      const index = Math.min(documentFetchCount, documentResponses.length - 1);
      documentFetchCount += 1;
      return { ok: true, data: documentResponses[index] as T };
    }
    if (path === "/api/progress") {
      return { ok: true, data: { saved: true } as T };
    }
    if (path === "/api/documents/doc-1/analysis") {
      return { ok: true, data: { queued: 1, status: "PROCESSING" } as T };
    }
    if (path === "/api/documents/doc-1/analysis/questions") {
      const rawBody = init?.body ? JSON.parse(String(init.body)) : {};
      const question = String(rawBody.question ?? "");
      if (question.includes("失败")) {
        return { ok: false, error: "句子问答暂时不可用" };
      }
      return {
        ok: true,
        data: {
          question,
          answer: `回答：${question}`,
          updatedAt: "2026-05-23T08:00:00.000Z",
        } as T,
      };
    }
    if (path === "/api/favorites" || path === "/api/favorites/doc-1" || path === "/api/vocab") {
      return { ok: true, data: {} as T };
    }

    return { ok: false, error: `Unexpected request: ${path}` };
  };
}

async function renderReader(payload: DocPayload | DocPayload[] = createPayload()) {
  const requests: TestEnv["requests"] = [];
  const scrollCalls: string[] = [];
  const intervalCallbacks: Array<() => void> = [];

  installDom();
  installBrowserMocks(scrollCalls);
  installIntervalMocks(intervalCallbacks);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(ReaderClient, {
        docId: "doc-1",
        fetcher: createFetch(payload, requests),
      }),
    );
  });

  await act(async () => {
    await waitForImmediate();
  });

  await act(async () => {
    await waitForImmediate();
  });

  await act(async () => {
    await waitForImmediate();
  });

  return {
    container,
    root,
    requests,
    scrollCalls,
    intervalCallbacks,
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();

      Object.defineProperty(globalThis, "window", { configurable: true, value: originalGlobals.window });
      Object.defineProperty(globalThis, "self", { configurable: true, value: originalGlobals.self });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalGlobals.document });
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalGlobals.navigator });
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: originalGlobals.HTMLElement,
      });
      Object.defineProperty(globalThis, "Event", { configurable: true, value: originalGlobals.Event });
      Object.defineProperty(globalThis, "MouseEvent", {
        configurable: true,
        value: originalGlobals.MouseEvent,
      });
      Object.defineProperty(globalThis, "Node", { configurable: true, value: originalGlobals.Node });
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalGlobals.localStorage,
      });
      Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        value: originalGlobals.IntersectionObserver,
      });
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
        configurable: true,
        value: originalGlobals.SpeechSynthesisUtterance,
      });
      Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: originalGlobals.requestAnimationFrame,
      });
      Object.defineProperty(globalThis, "cancelAnimationFrame", {
        configurable: true,
        value: originalGlobals.cancelAnimationFrame,
      });
      Object.defineProperty(globalThis, "setInterval", {
        configurable: true,
        value: originalGlobals.setInterval,
      });
      Object.defineProperty(globalThis, "clearInterval", {
        configurable: true,
        value: originalGlobals.clearInterval,
      });
      if (typeof window !== "undefined") {
        Object.defineProperty(window, "setInterval", {
          configurable: true,
          value: originalGlobals.window?.setInterval,
        });
        Object.defineProperty(window, "clearInterval", {
          configurable: true,
          value: originalGlobals.window?.clearInterval,
        });
      }
      (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
        originalGlobals.reactActEnvironment;
    },
  } satisfies TestEnv;
}

let currentEnv: TestEnv | null = null;

afterEach(() => {
  currentEnv?.cleanup();
  currentEnv = null;
});

test("reader shell defaults to English focus and exposes a collapsible study rail", async () => {
  currentEnv = await renderReader();

  assert.match(currentEnv.container.textContent ?? "", /Deep Work Notes/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /第零段中文。/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /学习侧栏/);

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /学习侧栏/);
  assert.match(currentEnv.container.textContent ?? "", /逐句解析/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /段落定位/);
});

test("opening the study rail uses a wider dock and rebalances the toolbar controls", async () => {
  currentEnv = await renderReader();

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const studyRail = currentEnv.container.querySelector("[data-study-rail-width]");
  const toolbarActions = currentEnv.container.querySelector("[data-reader-toolbar-actions]");

  assert.equal(studyRail?.getAttribute("data-study-rail-width"), "wide");
  assert.equal(toolbarActions?.getAttribute("data-toolbar-balance"), "rail-open");
});

test("scrolling the reading surface does not switch the rail paragraph unless the paragraph button is clicked", async () => {
  currentEnv = await renderReader();

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(String(currentEnv.container.textContent ?? ""), /逐句解析 · 第 2 段/);

  const scrollContainer = currentEnv.container.querySelector("[data-reader-density]");
  assert.ok(scrollContainer, "找不到正文滚动容器");

  const thirdParagraph = currentEnv.container.querySelector("[data-idx='2']");
  const secondParagraph = currentEnv.container.querySelector("[data-idx='1']");
  assert.ok(thirdParagraph, "找不到第三段正文节点");
  assert.ok(secondParagraph, "找不到第二段正文节点");

  const originalSecondRect = secondParagraph.getBoundingClientRect.bind(secondParagraph);
  const originalThirdRect = thirdParagraph.getBoundingClientRect.bind(thirdParagraph);

  Object.defineProperty(secondParagraph, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...originalSecondRect(), top: 1200 }),
  });
  Object.defineProperty(thirdParagraph, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...originalThirdRect(), top: 170 }),
  });

  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 2000 });
  Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 1000 });
  Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 600, writable: true });

  await act(async () => {
    scrollContainer.dispatchEvent(new window.Event("scroll", { bubbles: true }));
  });

  assert.match(String(currentEnv.container.textContent ?? ""), /逐句解析 · 第 2 段/);
});

test("study rail supports annotation mode and can jump back to the source paragraph", async () => {
  currentEnv = await renderReader();

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const noteTabButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("学习批注"),
  );
  assert.ok(noteTabButton, "找不到学习批注标签");

  await act(async () => {
    noteTabButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /先抓主干 keep，再补充宾语 the reader focused。/);

  const noteCard = currentEnv.container.querySelector("[data-note-card='compact']");
  assert.ok(noteCard, "学习批注没有渲染卡片");
  assert.doesNotMatch(String(noteCard.textContent ?? ""), /Paragraph one keeps the reader focused\./);
  assert.doesNotMatch(String(noteCard.textContent ?? ""), /第一段帮助读者保持专注。/);

  const locateButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("定位到第 2 段原文"),
  );
  assert.ok(locateButton, "找不到批注定位按钮");

  await act(async () => {
    locateButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.ok(currentEnv.scrollCalls.includes("1"), "批注定位后没有滚动到对应段落");
  const highlightNode = currentEnv.container.querySelector("[data-sentence-highlight='active']");
  assert.ok(highlightNode, "批注定位后没有高亮句子内容");
  assert.match(String(highlightNode?.textContent ?? ""), /Paragraph one keeps the reader focused\./);
});

test("switching from English mode to bilingual keeps the current paragraph anchored", async () => {
  currentEnv = await renderReader();
  currentEnv.scrollCalls.length = 0;

  const bilingualButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("title")?.includes("中英"),
  );
  assert.ok(bilingualButton, "找不到双语切换按钮");

  await act(async () => {
    bilingualButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /第一段帮助读者保持专注。/);
  assert.deepEqual(currentEnv.scrollCalls, ["1"]);
});

test("appearance settings can be opened and change reading density", async () => {
  currentEnv = await renderReader();

  const appearanceButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("调整阅读主题"),
  );
  assert.ok(appearanceButton, "找不到阅读主题按钮");

  await act(async () => {
    appearanceButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /阅读外观/);

  const compactButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("紧凑"),
  );
  assert.ok(compactButton, "找不到紧凑密度按钮");

  await act(async () => {
    compactButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const readingSurface = currentEnv.container.querySelector("[data-reader-density]");
  assert.equal(readingSurface?.getAttribute("data-reader-density"), "compact");
});

test("opening a paragraph analysis expands sentence details inline without a separate bottom panel", async () => {
  const payload = createPayload();
  payload.document.analysisSummary = {
    total: 3,
    ready: 2,
    processing: 0,
    pending: 0,
    failed: 1,
  };
  payload.paragraphs[1]!.enText = "Paragraph one keeps the reader focused. Another sentence adds a detail.";
  payload.paragraphs[1]!.zhText = "第一段帮助读者保持专注。另一句补充细节。";
  payload.paragraphs[1]!.sentences = [
    payload.paragraphs[1]!.sentences[0]!,
    {
      id: "sentence-1b",
      idx: 1,
      paragraphIdx: 1,
      sentenceIdx: 1,
      stableKey: "p1-s1-detail",
      enText: "Another sentence adds a detail.",
      analysis: {
        status: "READY",
        version: 1,
        provider: "mock",
        sourceType: "AI",
        updatedAt: "2026-05-22T12:31:10.000Z",
        retryCount: 0,
        error: null,
        canRetry: false,
        result: {
          translation: "另一句补充了一个细节。",
          chunks: [{ text: "adds a detail", gloss: "补充一个细节" }],
          structure: [{ label: "补充句", detail: "这句补充说明上一句的效果。" }],
          notes: ["读到第二句时，把它当成补充说明即可。"],
        },
      },
      manualRefineAction: {
        path: "/api/documents/doc-1/analysis",
        method: "PATCH",
        body: {
          sentenceId: "sentence-1b",
          stableKey: "p1-s1-detail",
          expectedVersion: 1,
        },
      },
    },
  ];

  currentEnv = await renderReader(payload);

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const openAnalysisButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(openAnalysisButton, "找不到查看解析入口");

  await act(async () => {
    openAnalysisButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /逐句解析/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /推荐断句/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /句子解析卡片/);
  assert.doesNotMatch(currentEnv.container.textContent ?? "", /段落定位/);
});

test("reader auto-retries failed sentence analyses and keeps the rail readable", async () => {
  currentEnv = await renderReader();

  const retryRequest = currentEnv.requests.find(
    (request) =>
      String(request.input) === "/api/documents/doc-1/analysis" &&
      String(request.init?.body ?? "").includes('"mode":"failed"'),
  );
  assert.ok(retryRequest, "没有发起重试请求");
  assert.equal(retryRequest.init?.method, "POST");
  assert.match(String(retryRequest.init?.body ?? ""), /"mode":"failed"/);

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /已自动重新提交失败句子的解析任务|解析补齐中/);
  assert.match(currentEnv.container.textContent ?? "", /Paragraph two adds more context for the reading rail\./);
});

test("clicking another sentence card expands it inline instead of scrolling to a bottom detail panel", async () => {
  const payload = createPayload();
  payload.document.analysisSummary = {
    total: 3,
    ready: 2,
    processing: 0,
    pending: 0,
    failed: 1,
  };
  payload.paragraphs[1]!.enText = "Paragraph one keeps the reader focused. Another sentence adds a detail.";
  payload.paragraphs[1]!.zhText = "第一段帮助读者保持专注。另一句补充细节。";
  payload.paragraphs[1]!.sentences = [
    payload.paragraphs[1]!.sentences[0]!,
    {
      id: "sentence-1b",
      idx: 1,
      paragraphIdx: 1,
      sentenceIdx: 1,
      stableKey: "p1-s1-detail",
      enText: "Another sentence adds a detail.",
      analysis: {
        status: "READY",
        version: 1,
        provider: "mock",
        sourceType: "AI",
        updatedAt: "2026-05-22T12:31:10.000Z",
        retryCount: 0,
        error: null,
        canRetry: false,
        result: {
          translation: "另一句补充了一个细节。",
          chunks: [{ text: "adds a detail", gloss: "补充一个细节" }],
          structure: [{ label: "补充句", detail: "这句补充说明上一句的效果。" }],
          notes: ["读到第二句时，把它当成补充说明即可。"],
        },
      },
      manualRefineAction: {
        path: "/api/documents/doc-1/analysis",
        method: "PATCH",
        body: {
          sentenceId: "sentence-1b",
          stableKey: "p1-s1-detail",
          expectedVersion: 1,
        },
      },
    },
  ];

  currentEnv = await renderReader(payload);

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(paragraphButton, "找不到段落解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const sentencePreviewButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("第 2 句") &&
    button.textContent?.includes("Another sentence adds a detail."),
  );
  assert.ok(sentencePreviewButton, "找不到句子预览卡片");

  currentEnv.scrollCalls.length = 0;

  await act(async () => {
    sentencePreviewButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /主释义|语法说明/);
  assert.match(currentEnv.container.textContent ?? "", /另一句补充了一个细节。/);
  assert.ok(!currentEnv.scrollCalls.includes("sentence-detail"), "点击句子后不应再滚动到底部详情区");
});

test("analysis cards expose compact and expanded states so the rail can render a drawer-like hierarchy", async () => {
  const payload = createPayload();
  payload.document.analysisSummary = {
    total: 3,
    ready: 2,
    processing: 0,
    pending: 0,
    failed: 1,
  };
  payload.paragraphs[1]!.enText = "Paragraph one keeps the reader focused. Another sentence adds a detail.";
  payload.paragraphs[1]!.zhText = "第一段帮助读者保持专注。另一句补充细节。";
  payload.paragraphs[1]!.sentences = [
    payload.paragraphs[1]!.sentences[0]!,
    {
      id: "sentence-1b",
      idx: 1,
      paragraphIdx: 1,
      sentenceIdx: 1,
      stableKey: "p1-s1-detail",
      enText: "Another sentence adds a detail.",
      analysis: {
        status: "READY",
        version: 1,
        provider: "mock",
        sourceType: "AI",
        updatedAt: "2026-05-22T12:31:10.000Z",
        retryCount: 0,
        error: null,
        canRetry: false,
        result: {
          translation: "另一句补充了一个细节。",
          chunks: [{ text: "adds a detail", gloss: "补充一个细节" }],
          structure: [{ label: "补充句", detail: "这句补充说明上一句的效果。" }],
          notes: ["读到第二句时，把它当成补充说明即可。"],
        },
      },
      manualRefineAction: {
        path: "/api/documents/doc-1/analysis",
        method: "PATCH",
        body: {
          sentenceId: "sentence-1b",
          stableKey: "p1-s1-detail",
          expectedVersion: 1,
        },
      },
    },
  ];

  currentEnv = await renderReader(payload);

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(paragraphButton, "找不到段落解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const cardsBefore = Array.from(currentEnv.container.querySelectorAll("[data-sentence-card-state]"));
  assert.equal(cardsBefore.length, 2, "逐句卡片数量不对");
  assert.equal(cardsBefore.filter((node) => node.getAttribute("data-sentence-card-state") === "expanded").length, 1);

  const secondCard = cardsBefore.find((node) => node.getAttribute("data-sentence-id") === "sentence-1b");
  assert.ok(secondCard, "找不到第二句卡片");

  await act(async () => {
    secondCard.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const cardsAfter = Array.from(currentEnv.container.querySelectorAll("[data-sentence-card-state]"));
  assert.equal(cardsAfter.filter((node) => node.getAttribute("data-sentence-card-state") === "expanded").length, 1);
  assert.equal(
    cardsAfter.find((node) => node.getAttribute("data-sentence-id") === "sentence-1b")?.getAttribute("data-sentence-card-state"),
    "expanded",
  );
});

test("focused paragraphs expose a restrained emphasis state on the reading surface", async () => {
  currentEnv = await renderReader();

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 3 段"),
  );
  assert.ok(paragraphButton, "找不到第三段的解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const selectedParagraph = currentEnv.container.querySelector("[data-idx='2']");
  const previousParagraph = currentEnv.container.querySelector("[data-idx='1']");

  assert.equal(selectedParagraph?.getAttribute("data-paragraph-focus-state"), "selected");
  assert.equal(previousParagraph?.getAttribute("data-paragraph-focus-state"), "idle");

  assert.doesNotMatch(selectedParagraph?.className ?? "", /amber/);
  assert.doesNotMatch(selectedParagraph?.className ?? "", /transition/);
});

test("expanded sentence details expose a motion hook for a softer inline reveal", async () => {
  const payload = createPayload();
  payload.document.analysisSummary = {
    total: 3,
    ready: 2,
    processing: 0,
    pending: 0,
    failed: 1,
  };
  payload.paragraphs[1]!.enText = "Paragraph one keeps the reader focused. Another sentence adds a detail.";
  payload.paragraphs[1]!.zhText = "第一段帮助读者保持专注。另一句补充细节。";
  payload.paragraphs[1]!.sentences = [
    payload.paragraphs[1]!.sentences[0]!,
    {
      id: "sentence-1b",
      idx: 1,
      paragraphIdx: 1,
      sentenceIdx: 1,
      stableKey: "p1-s1-detail",
      enText: "Another sentence adds a detail.",
      analysis: {
        status: "READY",
        version: 1,
        provider: "mock",
        sourceType: "AI",
        updatedAt: "2026-05-22T12:31:10.000Z",
        retryCount: 0,
        error: null,
        canRetry: false,
        result: {
          translation: "另一句补充了一个细节。",
          chunks: [{ text: "adds a detail", gloss: "补充一个细节" }],
          structure: [{ label: "补充句", detail: "这句补充说明上一句的效果。" }],
          notes: ["读到第二句时，把它当成补充说明即可。"],
        },
      },
      manualRefineAction: {
        path: "/api/documents/doc-1/analysis",
        method: "PATCH",
        body: {
          sentenceId: "sentence-1b",
          stableKey: "p1-s1-detail",
          expectedVersion: 1,
        },
      },
    },
  ];

  currentEnv = await renderReader(payload);

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(paragraphButton, "找不到段落解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.equal(currentEnv.container.querySelectorAll("[data-sentence-detail-state='expanded']").length, 1);

  const secondCard = currentEnv.container.querySelector("[data-sentence-id='sentence-1b']");
  assert.ok(secondCard, "找不到第二句卡片");

  await act(async () => {
    secondCard.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.equal(currentEnv.container.querySelectorAll("[data-sentence-detail-state='expanded']").length, 1);
  assert.match(currentEnv.container.textContent ?? "", /主释义|语法说明/);
});

test("expanded sentence cards keep a single translation, replace chunk cards with inline annotations, and expose sentence QA", async () => {
  currentEnv = await renderReader();

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(paragraphButton, "找不到段落解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const selectedCard = currentEnv.container.querySelector("[data-sentence-id='sentence-1']");
  assert.ok(selectedCard, "找不到第一句卡片");

  const selectedCardText = selectedCard.textContent ?? "";
  assert.equal(countOccurrences(selectedCardText, "这一段帮助读者保持专注。"), 1, "展开卡片里不应重复渲染中文释义");
  assert.doesNotMatch(selectedCardText, /推荐断句/);

  const questionInput = selectedCard.querySelector("textarea");
  const submitButton = Array.from(selectedCard.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("发送"),
  );

  assert.ok(questionInput, "缺少句子提问输入框");
  assert.ok(submitButton, "缺少句子提问按钮");
});

test("sentence QA submits per-sentence context and shows answer and error states inline", async () => {
  currentEnv = await renderReader();

  const paragraphButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("查看第 2 段"),
  );
  assert.ok(paragraphButton, "找不到段落解析入口按钮");

  await act(async () => {
    paragraphButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const selectedCard = currentEnv.container.querySelector("[data-sentence-id='sentence-1']");
  assert.ok(selectedCard, "找不到第一句卡片");

  const questionInput = selectedCard.querySelector("textarea") as HTMLTextAreaElement | null;
  const submitButton = Array.from(selectedCard.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("发送"),
  );
  assert.ok(questionInput, "缺少句子提问输入框");
  assert.ok(submitButton, "缺少句子提问按钮");

  await act(async () => {
    setTextareaValue(questionInput, "这里为什么用 focused？");
    await waitForImmediate();
  });

  await act(async () => {
    submitButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await waitForImmediate();
  });

  assert.match(selectedCard.textContent ?? "", /回答：这里为什么用 focused？/);
  const qaRequest = currentEnv.requests.find((request) => String(request.input) === "/api/documents/doc-1/analysis/questions");
  assert.ok(qaRequest, "没有发出句子问答请求");
  assert.match(String(qaRequest.init?.body ?? ""), /"sentenceId":"sentence-1"/);
  assert.match(String(qaRequest.init?.body ?? ""), /"stableKey":"p1-s0-focused"/);
  assert.match(String(qaRequest.init?.body ?? ""), /"question":"这里为什么用 focused？"/);

  await act(async () => {
    setTextareaValue(questionInput, "请失败一次");
    await waitForImmediate();
  });

  await act(async () => {
    submitButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await waitForImmediate();
  });

  assert.match(selectedCard.textContent ?? "", /句子问答暂时不可用/);
});

test("note cards expose compact metadata hooks for the denser rail layout", async () => {
  currentEnv = await renderReader();

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const noteTabButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("学习批注"),
  );
  assert.ok(noteTabButton, "找不到学习批注标签");

  await act(async () => {
    noteTabButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  const noteCard = currentEnv.container.querySelector("[data-note-card='compact']");
  assert.ok(noteCard, "学习批注没有使用紧凑卡片布局");
  assert.ok(noteCard?.querySelector("[data-note-meta='source']"), "批注卡片缺少来源元信息钩子");
});

test("reader refreshes the document while sentence analysis is still processing", async () => {
  const initial = createPayload();
  initial.document.analysisSummary = {
    total: 2,
    ready: 0,
    processing: 2,
    pending: 0,
    failed: 0,
  };
  initial.document.status.analysis = "PROCESSING";
  initial.paragraphs[1]!.sentences[0]!.analysis = {
    ...initial.paragraphs[1]!.sentences[0]!.analysis!,
    status: "PROCESSING",
    result: null,
  };
  initial.paragraphs[2]!.sentences[0]!.analysis = {
    ...initial.paragraphs[2]!.sentences[0]!.analysis!,
    status: "PROCESSING",
    error: null,
    result: null,
  };

  const refreshed = createPayload();
  currentEnv = await renderReader([initial, refreshed]);
  assert.ok(currentEnv.intervalCallbacks.length > 0, "解析进行中时没有注册轮询");

  await act(async () => {
    currentEnv.intervalCallbacks[0]?.();
    await waitForImmediate();
  });

  const openRailButton = Array.from(currentEnv.container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("打开学习侧栏"),
  );
  assert.ok(openRailButton, "找不到学习侧栏按钮");

  await act(async () => {
    openRailButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  assert.match(currentEnv.container.textContent ?? "", /查看解析/);
  const docRequests = currentEnv.requests.filter((request) => String(request.input) === "/api/documents/doc-1");
  assert.equal(docRequests.length, 2);
});
