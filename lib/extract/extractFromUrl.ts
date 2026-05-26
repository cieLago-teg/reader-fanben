import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { assertSafeHttpUrl } from "../security/ssrf";

export type ExtractedArticle = {
  title: string;
  byline?: string;
  text: string;
};

const MAX_HTML_BYTES = 2_000_000; // 2MB
const FETCH_TIMEOUT_MS = 15_000;
const BLOCK_SELECTOR = "p, li, blockquote, pre";

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBlockText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractStructuredText(articleHtml: string, fallbackText: string) {
  const articleDom = new JSDOM(articleHtml);
  const nodes = Array.from(articleDom.window.document.querySelectorAll(BLOCK_SELECTOR));

  const blocks = nodes
    .filter((node) => !node.parentElement?.closest(BLOCK_SELECTOR))
    .map((node) => normalizeBlockText(node.textContent || ""))
    .filter(Boolean);

  if (blocks.length >= 2) {
    return blocks.join("\n\n");
  }

  return fallbackText;
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractedArticle> {
  const url = await assertSafeHttpUrl(rawUrl);

  const res = await fetchWithTimeout(url.toString(), {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; FanbenReader/0.1; +https://example.local)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`抓取失败：HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("该链接似乎不是 HTML 页面，建议改用“粘贴正文”导入");
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new Error("页面过大（>2MB），建议改用“粘贴正文”导入");
  }

  const html = new TextDecoder("utf-8").decode(buf);
  const dom = new JSDOM(html, { url: url.toString() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.textContent) {
    throw new Error("正文抽取失败，建议改用“粘贴正文”导入");
  }

  const structuredText = extractStructuredText(article.content || "", article.textContent);

  return {
    title: article.title || url.hostname,
    byline: article.byline || undefined,
    text: structuredText,
  };
}
