import { createHash } from "crypto";
import { db } from "../db";
import { buildMorphologyNote } from "./affix";
import { guessLemma, normalizeSelectedWord } from "./normalize";
import { lookupDictionaryApi } from "./providerDictionaryApi";
import { lookupDeepSeekApi } from "./providerDeepSeek";
import { LexiconResult } from "./types";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function buildCacheKey(term: string) {
  return `en:${sha256(term)}`;
}

function uniqTerms(terms: Array<string | undefined>) {
  return Array.from(new Set(terms.filter((term): term is string => Boolean(term))));
}

function normalizeLexiconPayload(
  payload: LexiconResult,
  normalizedWord: string,
  lemma: string,
): LexiconResult {
  const headword = payload.headword || payload.lemma || lemma || normalizedWord;
  const phonetic = payload.phonetic || payload.pronunciation?.text;
  const senses = payload.senses?.length ? payload.senses : [{ definitions: ["（未查到释义）"] }];
  const firstSense = senses[0];
  const firstGloss = firstSense?.definitions[0] || "（未查到释义）";
  const morphology = payload.morphology ?? buildMorphologyNote(headword);

  return {
    ...payload,
    word: normalizedWord,
    headword,
    lemma,
    phonetic,
    pronunciation: payload.pronunciation || {
      text: phonetic,
      audioUrl: undefined,
    },
    coreMeaning: payload.coreMeaning ?? {
      partOfSpeech: firstSense?.partOfSpeech,
      gloss: firstGloss,
    },
    senses,
    morphology,
    related:
      payload.related ??
      (morphology?.affixes ? morphology.affixes.map((a) => a.replace(/^-|-$|-/g, "")) : undefined),
  };
}

async function fetchLookupPayload(terms: string[], context?: string) {
  for (const term of terms) {
    const [dictResult, dsResult] = await Promise.all([
      lookupDictionaryApi(term),
      lookupDeepSeekApi(term, context),
    ]);
    
    if (dsResult) {
      return {
        ...dsResult,
        pronunciation: {
          text: dsResult.phonetic || dictResult?.phonetic,
          audioUrl: dictResult?.pronunciation?.audioUrl,
        },
      } as LexiconResult;
    }
    if (dictResult) return dictResult;
  }
  return null;
}

export async function lookupWord(rawWord: string, context?: string): Promise<LexiconResult> {
  const normalized = normalizeSelectedWord(rawWord);
  if (!normalized) throw new Error("请选择一个有效单词");

  const lemma = guessLemma(normalized);
  const cacheTerms = uniqTerms([normalized, lemma]);
  const cacheKeys = cacheTerms.map(buildCacheKey);

  const prisma = db();
  const cachedEntries = await prisma.dictionaryCache.findMany({
    where: { key: { in: cacheKeys } },
  });
  const cacheByKey = new Map(cachedEntries.map((entry) => [entry.key, entry]));
  let stalePayload: LexiconResult | null = null;

  for (const key of cacheKeys) {
    const cached = cacheByKey.get(key);
    if (!cached) continue;
    const payload = cached.payloadJson as LexiconResult;
    if (!stalePayload) stalePayload = payload;
    if (!cached.expiresAt || cached.expiresAt.getTime() > Date.now()) {
      return normalizeLexiconPayload(payload, normalized, lemma);
    }
  }

  const providerResult = await fetchLookupPayload(uniqTerms([lemma, normalized]), context);
  const result = providerResult ?? {
    word: normalized,
    headword: lemma,
    lemma,
    coreMeaning: {
      gloss: "（未查到释义）",
    },
    senses: [{ definitions: ["（未查到释义）"] }],
    provider: "fallback",
  };

  if (!providerResult && stalePayload) {
    return normalizeLexiconPayload(stalePayload, normalized, lemma);
  }

  const payload = normalizeLexiconPayload(result, normalized, lemma);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  const aliasTerms = uniqTerms([normalized, lemma, payload.headword]);

  await Promise.all(
    aliasTerms.map((term) =>
      prisma.dictionaryCache.upsert({
        where: { key: buildCacheKey(term) },
        create: {
          key: buildCacheKey(term),
          provider: payload.provider,
          payloadJson: payload,
          expiresAt,
        },
        update: {
          provider: payload.provider,
          payloadJson: payload,
          expiresAt,
        },
      }),
    ),
  );

  return payload;
}
