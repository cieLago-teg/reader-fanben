import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getErrorMessage } from "@/lib/error";
import { attachUserIdHeader, getOrCreateUserId } from "@/lib/requestUser";
import {
  answerSentenceQuestion,
  validateSentenceQuestionBody,
} from "@/lib/reader/sentenceQuestionAnswer";
import { normalizeSentenceAnalysisResult } from "@/lib/reader/documentAssets";
import { jsonError, jsonOk } from "../../../../_shared/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = new Headers();

  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { id } = await params;
    const raw = await req.text();
    const body = validateSentenceQuestionBody(raw ? JSON.parse(raw) : null);

    const prisma = db();
    const sentence = await prisma.sentence.findFirst({
      where: {
        id: body.sentenceId,
        documentId: id,
        document: { userId },
      },
      include: {
        paragraph: {
          select: {
            enText: true,
            zhText: true,
          },
        },
        analysis: true,
      },
    });

    if (!sentence) {
      return jsonError("句子不存在或不属于当前文章", 404, { headers });
    }

    if (sentence.stableKey !== body.stableKey) {
      return jsonError("句子上下文已变化，请刷新后重试", 409, { headers });
    }

    const currentVersion = sentence.analysis?.version ?? 0;
    if (currentVersion !== body.expectedVersion) {
      return jsonError("句子解析已更新，请刷新后再提问", 409, { headers });
    }

    if (sentence.analysis?.status !== "READY" || !sentence.analysis.payloadJson) {
      return jsonError("当前句子的解析尚未准备好，暂时不能提问", 409, { headers });
    }

    const analysis = normalizeSentenceAnalysisResult(
      sentence.enText,
      sentence.analysis.payloadJson as Parameters<typeof normalizeSentenceAnalysisResult>[1],
    );
    if (!analysis) {
      return jsonError("当前句子的解析数据不可用，暂时不能提问", 409, { headers });
    }

    const answer = await answerSentenceQuestion({
      question: body.question,
      context: {
        sentenceText: sentence.enText,
        paragraphText: sentence.paragraph.enText,
        paragraphTranslation: sentence.paragraph.zhText,
        analysis,
      },
    });

    return jsonOk(answer, { headers });
  } catch (error: unknown) {
    return jsonError(getErrorMessage(error, "句子问答失败"), 400, { headers });
  }
}
