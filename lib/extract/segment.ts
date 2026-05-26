export function normalizeText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(paragraph: string, maxLength: number = 500): string[] {
  if (paragraph.length <= maxLength) return [paragraph];

  let segments: string[] = [];
  try {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    segments = Array.from(segmenter.segment(paragraph))
      .map((s) => s.segment.trim())
      .filter(Boolean);
  } catch (e) {
    const matches = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [paragraph];
    segments = matches.map((part) => part.trim()).filter(Boolean);
  }

  if (segments.length <= 1) return [paragraph];

  const result: string[] = [];
  let currentChunk = "";

  for (const sentence of segments) {
    if (!currentChunk) {
      currentChunk = sentence;
    } else if (currentChunk.length + sentence.length + 1 <= maxLength) {
      currentChunk += " " + sentence;
    } else {
      result.push(currentChunk);
      currentChunk = sentence;
    }
  }

  if (currentChunk) {
    result.push(currentChunk);
  }

  return result;
}

export function segmentParagraphs(text: string): string[] {
  const normalized = normalizeText(text);
  const rawParts = normalized.split(/\n\s*\n/g).map((s) => s.trim());

  const mergedParts: string[] = [];
  for (const p of rawParts) {
    if (!p) continue;
    // 只合并特别短且不像完整句子的碎片，避免把正文首段错误吞并。
    const looksLikeStandaloneSentence =
      p.length >= 18 || /[.!?。！？:：]$/.test(p) || p.split(/\s+/).length >= 4;
    if (mergedParts.length > 0 && p.length < 16 && !looksLikeStandaloneSentence) {
      mergedParts[mergedParts.length - 1] += " " + p;
      continue;
    }
    mergedParts.push(p);
  }

  const finalParts: string[] = [];
  for (const p of mergedParts) {
    finalParts.push(...splitLongParagraph(p, 500));
  }

  return finalParts;
}
