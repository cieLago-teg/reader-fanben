import assert from "node:assert/strict";
import test from "node:test";
import { lookupWord } from "./index";

type CacheRecord = {
  key: string;
  provider: string;
  payloadJson: unknown;
  expiresAt?: Date | null;
};

function createFakePrisma(cache = new Map<string, CacheRecord>()) {
  return {
    dictionaryCache: {
      async findUnique({ where: { key } }: { where: { key: string } }) {
        return cache.get(key) ?? null;
      },
      async findMany({
        where: {
          key: { in: keys },
        },
      }: {
        where: { key: { in: string[] } };
      }) {
        return keys.map((key) => cache.get(key)).filter(Boolean);
      },
      async upsert({
        where: { key },
        create,
        update,
      }: {
        where: { key: string };
        create: Omit<CacheRecord, "key"> & { key?: string };
        update: Partial<Omit<CacheRecord, "key">>;
      }) {
        const existing = cache.get(key);
        const next = {
          key,
          provider: existing?.provider ?? create.provider,
          payloadJson: existing?.payloadJson ?? create.payloadJson,
          expiresAt: existing?.expiresAt ?? create.expiresAt ?? null,
          ...existing,
          ...update,
        } satisfies CacheRecord;
        cache.set(key, next);
        return next;
      },
    },
  };
}

test(
  "lookupWord returns headword, core meaning and pronunciation audio for inflected words",
  { concurrency: false },
  async () => {
    const cache = new Map<string, CacheRecord>();
    const globals = globalThis as typeof globalThis & {
      __prisma?: ReturnType<typeof createFakePrisma>;
      fetch: typeof fetch;
    };
    const originalFetch = globals.fetch;
    globals.__prisma = createFakePrisma(cache);
    globals.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            word: "run",
            phonetic: "/rʌn/",
            phonetics: [{ text: "/rʌn/", audio: "https://audio.example/run.mp3" }],
            meanings: [
              {
                partOfSpeech: "verb",
                definitions: [
                  {
                    definition: "move swiftly on foot",
                    example: "I run every morning.",
                  },
                ],
              },
            ],
          },
        ]),
        { status: 200 },
      )) as typeof fetch;

    try {
      const result = await lookupWord("Running");

      assert.equal(result.word, "running");
      assert.equal(result.lemma, "run");
      assert.equal((result as Record<string, unknown>).headword, "run");
      assert.deepEqual((result as Record<string, unknown>).coreMeaning, {
        partOfSpeech: "verb",
        gloss: "move swiftly on foot",
      });
      assert.deepEqual((result as Record<string, unknown>).pronunciation, {
        text: "rʌn",
        audioUrl: "https://audio.example/run.mp3",
      });
    } finally {
      globals.fetch = originalFetch;
      delete globals.__prisma;
    }
  },
);

test(
  "lookupWord reuses cache across inflected forms without fetching twice",
  { concurrency: false },
  async () => {
    const cache = new Map<string, CacheRecord>();
    const globals = globalThis as typeof globalThis & {
      __prisma?: ReturnType<typeof createFakePrisma>;
      fetch: typeof fetch;
    };
    const originalFetch = globals.fetch;
    let fetchCalls = 0;
    globals.__prisma = createFakePrisma(cache);
    globals.fetch = (async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify([
          {
            word: "run",
            phonetic: "/rʌn/",
            phonetics: [{ text: "/rʌn/", audio: "https://audio.example/run.mp3" }],
            meanings: [
              {
                partOfSpeech: "verb",
                definitions: [{ definition: "move swiftly on foot" }],
              },
            ],
          },
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      await lookupWord("run");
      const result = await lookupWord("running");

      assert.equal(fetchCalls, 1);
      assert.equal(result.lemma, "run");
      assert.equal((result as Record<string, unknown>).headword, "run");
    } finally {
      globals.fetch = originalFetch;
      delete globals.__prisma;
    }
  },
);

test(
  "lookupWord does not throw when dictionary API fetch fails",
  { concurrency: false },
  async () => {
    const cache = new Map<string, CacheRecord>();
    const globals = globalThis as typeof globalThis & {
      __prisma?: ReturnType<typeof createFakePrisma>;
      fetch: typeof fetch;
    };
    const originalFetch = globals.fetch;
    globals.__prisma = createFakePrisma(cache);
    globals.fetch = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;

    try {
      const result = await lookupWord("constraints");
      assert.equal(result.word, "constraints");
      assert.ok(result.coreMeaning?.gloss);
    } finally {
      globals.fetch = originalFetch;
      delete globals.__prisma;
    }
  },
);
