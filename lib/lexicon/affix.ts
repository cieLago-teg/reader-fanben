type AffixRule = {
  affix: string;
  type: "prefix" | "suffix";
  meaning: string;
};

// MVP：小而美的规则库（后续你可以慢慢扩展）
const RULES: AffixRule[] = [
  { affix: "un", type: "prefix", meaning: "否定/相反" },
  { affix: "re", type: "prefix", meaning: "再次/重新" },
  { affix: "dis", type: "prefix", meaning: "否定/分离" },
  { affix: "mis", type: "prefix", meaning: "错误/坏的" },
  { affix: "pre", type: "prefix", meaning: "在…之前" },
  { affix: "tion", type: "suffix", meaning: "名词后缀（行为/结果）" },
  { affix: "ment", type: "suffix", meaning: "名词后缀（结果/状态）" },
  { affix: "able", type: "suffix", meaning: "形容词后缀（可以…的）" },
  { affix: "less", type: "suffix", meaning: "形容词后缀（没有…的）" },
  { affix: "ful", type: "suffix", meaning: "形容词后缀（充满…的）" },
];

export function buildMorphologyNote(word: string) {
  const w = word.toLowerCase();
  const affixes: string[] = [];
  const notes: string[] = [];

  for (const r of RULES) {
    if (r.type === "prefix" && w.startsWith(r.affix) && w.length > r.affix.length + 2) {
      affixes.push(`${r.affix}-`);
      notes.push(`${r.affix}-：${r.meaning}`);
    }
    if (r.type === "suffix" && w.endsWith(r.affix) && w.length > r.affix.length + 2) {
      affixes.push(`-${r.affix}`);
      notes.push(`-${r.affix}：${r.meaning}`);
    }
  }

  if (affixes.length === 0) return undefined;
  return { affixes, note: notes.join("；") };
}

