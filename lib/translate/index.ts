import { createHash } from "crypto";
import { db } from "../db";
import { TranslateParams, TranslateProvider, TranslateResult } from "./types";
import { MockTranslateProvider } from "./providers/mock";
import { MyMemoryTranslateProvider } from "./providers/mymemory";
import { DeepSeekTranslateProvider } from "./providers/deepseek";

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function getProvider(): TranslateProvider {
  const name = (process.env.TRANSLATE_PROVIDER || "deepseek").toLowerCase();
  if (name === "mock") return new MockTranslateProvider();
  if (name === "mymemory") return new MyMemoryTranslateProvider();
  return new DeepSeekTranslateProvider();
}

export async function translateWithCache(
  text: string,
  params: TranslateParams = { from: "en", to: "zh-CN" },
): Promise<TranslateResult> {
  const provider = getProvider();
  const key = `${provider.name}:${params.from}:${params.to}:${sha256(text)}`;

  const prisma = db();
  const cached = await prisma.translationCache.findUnique({ where: { key } });
  if (cached) {
    return { zhText: cached.zhText, provider: cached.provider };
  }

  const zhText = await provider.translateParagraph(text, params);
  await prisma.translationCache.upsert({
    where: { key },
    create: { key, provider: provider.name, zhText },
    update: { provider: provider.name, zhText },
  });

  return { zhText, provider: provider.name };
}
