import { TranslateParams, TranslateProvider } from "../types";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export class DeepSeekTranslateProvider implements TranslateProvider {
  name = "deepseek";

  async translateParagraph(text: string, params: TranslateParams): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY environment variable");
    }

    const systemPrompt = `You are a professional translator. Translate the following text from ${params.from} to ${params.to}. Output ONLY the translated text, without any additional explanations, quotes, or formatting.`;

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_TRANSLATE_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const translated = data.choices?.[0]?.message?.content;
    if (!translated || typeof translated !== "string") {
      throw new Error("翻译失败：DeepSeek 未返回有效的译文");
    }

    return translated.trim();
  }
}
