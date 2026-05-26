const PUNCT = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

export function normalizeSelectedWord(raw: string) {
  const cleaned = raw.replace(PUNCT, "").trim();
  return cleaned.toLowerCase();
}

// 超简词形还原：只做一点点，提升命中率
export function guessLemma(word: string) {
  const w = word.toLowerCase();
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ied") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) {
    const base = w.slice(0, -3);
    if (/(.)\1$/.test(base)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith("ed") && w.length > 4) {
    const base = w.slice(0, -2);
    if (/(.)\1$/.test(base)) return base.slice(0, -1);
    return base;
  }
  return w;
}
