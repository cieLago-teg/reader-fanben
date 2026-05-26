import { LexiconResult } from "./types";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export async function lookupDeepSeekApi(word: string, context?: string): Promise<Partial<LexiconResult> | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const prompt = `
You are an expert English teacher for Chinese learners.
Please analyze the word "${word}"${context ? ` in the context of: "${context}"` : ""}.
Provide the following information in JSON format:
{
  "headword": "the base form of the word",
  "phonetic": "the phonetic transcription (e.g. /rʌn/)",
  "coreMeaning": {
    "partOfSpeech": "v./n./adj./adv. etc",
    "gloss": "the core Chinese meaning"
  },
  "senses": [
    {
      "partOfSpeech": "part of speech",
      "definitions": ["Chinese definition 1", "Chinese definition 2"]
    }
  ],
  "examples": [
    "English example sentence. 中文翻译。"
  ],
  "morphology": {
    "note": "词根词缀分析 (e.g. pre- 前缀 + ci 词根...)",
    "affixes": ["pre-", "ci"]
  },
  "mnemonic": "记忆妙招：使用谐音、联想或词源故事来帮助记忆这个单词。"
}
Keep the explanations concise and engaging. Do not output anything other than the JSON object.
`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_TRANSLATE_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      word,
      headword: parsed.headword || word,
      phonetic: parsed.phonetic,
      coreMeaning: parsed.coreMeaning,
      senses: parsed.senses || [],
      examples: parsed.examples || [],
      morphology: parsed.morphology,
      mnemonic: parsed.mnemonic,
      provider: "deepseek",
    };
  } catch (e) {
    console.error("DeepSeek lookup failed", e);
    return null;
  }
}
