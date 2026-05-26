import { LexiconResult } from "./types";

type DictionaryApiDefinition = { definition?: string; example?: string };
type DictionaryApiMeaning = { partOfSpeech?: string; definitions?: DictionaryApiDefinition[] };
type DictionaryApiPhonetic = { text?: string; audio?: string };
type DictionaryApiEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: DictionaryApiPhonetic[];
  meanings?: DictionaryApiMeaning[];
};

function normalizePhoneticText(text?: string) {
  if (!text) return undefined;
  const cleaned = text.trim().replace(/^\/+|\/+$/g, "");
  return cleaned || undefined;
}

export async function lookupDictionaryApi(word: string): Promise<LexiconResult | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return null;
    const first = json?.[0] as DictionaryApiEntry | undefined;
    if (!first) return null;

    const headword = (first.word || word).toLowerCase();
    const phonetic =
      normalizePhoneticText(first.phonetic) ||
      normalizePhoneticText(first.phonetics?.find((p) => typeof p?.text === "string")?.text);
    const audioUrl =
      first.phonetics?.find((p) => typeof p?.audio === "string" && p.audio.trim())?.audio || undefined;

    const senses =
      first.meanings?.map((m) => ({
        partOfSpeech: m.partOfSpeech,
        definitions: (m.definitions || [])
          .map((d) => d?.definition)
          .filter((x): x is string => typeof x === "string")
          .slice(0, 3),
      }))?.filter((s) => s.definitions.length > 0) ?? [];

    const examples: string[] = [];
    for (const m of first.meanings || []) {
      for (const d of m.definitions || []) {
        if (typeof d?.example === "string") examples.push(d.example);
        if (examples.length >= 2) break;
      }
      if (examples.length >= 2) break;
    }

    const coreSense = senses[0];
    const coreMeaning = coreSense?.definitions[0];
    if (!coreMeaning) return null;

    return {
      word,
      headword,
      coreMeaning: {
        partOfSpeech: coreSense?.partOfSpeech,
        gloss: coreMeaning,
      },
      phonetic,
      pronunciation: {
        text: phonetic,
        audioUrl,
      },
      senses,
      examples: examples.length ? examples : undefined,
      provider: "dictionaryapi.dev",
    };
  } catch {
    return null;
  }
}
