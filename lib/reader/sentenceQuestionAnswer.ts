import { z } from "zod";
import type { SentenceAnalysisResult } from "./documentAssets";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export const SentenceQuestionBodySchema = z.object({
  sentenceId: z.string().trim().min(1),
  stableKey: z.string().trim().min(1),
  expectedVersion: z.number().int().min(0),
  question: z.string().trim().min(1).max(500),
  scope: z.literal("sentence"),
});

export type SentenceQuestionBody = z.infer<typeof SentenceQuestionBodySchema>;

export type SentenceQuestionContext = {
  sentenceText: string;
  paragraphText?: string | null;
  paragraphTranslation?: string | null;
  analysis: SentenceAnalysisResult;
};

export function validateSentenceQuestionBody(input: unknown): SentenceQuestionBody {
  return SentenceQuestionBodySchema.parse(input);
}

export function buildSentenceQuestionPrompt(args: {
  question: string;
  context: SentenceQuestionContext;
}) {
  const { context, question } = args;
  const annotationLines = (context.analysis.inlineAnnotations ?? [])
    .map(
      (annotation, index) =>
        `${index + 1}. ${annotation.label}: "${annotation.text}" - ${annotation.detail}`,
    )
    .join("\n");
  const structureLines = context.analysis.structure
    .map((item, index) => `${index + 1}. ${item.label}: ${item.detail}`)
    .join("\n");
  const noteLines = context.analysis.notes.map((note, index) => `${index + 1}. ${note}`).join("\n");

  return [
    "请只围绕当前句子回答，不要扩展成全文聊天。",
    `当前句子：${context.sentenceText}`,
    context.paragraphText ? `所在段落（英文）：${context.paragraphText}` : null,
    context.paragraphTranslation ? `所在段落（中文）：${context.paragraphTranslation}` : null,
    `主释义：${context.analysis.translation}`,
    annotationLines ? `结构标注：\n${annotationLines}` : null,
    structureLines ? `结构说明：\n${structureLines}` : null,
    noteLines ? `阅读提醒：\n${noteLines}` : null,
    `用户问题：${question.trim()}`,
    "回答要求：",
    "1. 使用简体中文。",
    "2. 先直接回答问题，再按需要补一句理解提示。",
    "3. 只解释和这句话直接相关的内容，不要泛泛而谈。",
    "4. 保持克制清晰，长度控制在 2 到 5 句。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function answerSentenceQuestion(args: {
  question: string;
  context: SentenceQuestionContext;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY environment variable");
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const prompt = buildSentenceQuestionPrompt({
    question: args.question,
    context: args.context,
  });

  const res = await fetchImpl("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_QA_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert English reading coach. Answer only questions about the supplied sentence and its analysis. Reply in Simplified Chinese.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== "string") {
    throw new Error("句子问答失败：DeepSeek 未返回有效答案");
  }

  return {
    question: args.question.trim(),
    answer: answer.trim(),
    updatedAt: (args.now?.() ?? new Date()).toISOString(),
  };
}
