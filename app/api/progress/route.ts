import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../_shared/response";

export const runtime = "nodejs";

const BodySchema = z.object({
  documentId: z.string().min(1),
  lastParagraphIdx: z.number().int().min(0),
  percent: z.number().min(0).max(1),
});

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const body = BodySchema.parse(await req.json());

    // 权限校验：文档必须属于该用户
    const prisma = db();
    const doc = await prisma.document.findFirst({
      where: { id: body.documentId, userId },
      select: { id: true },
    });
    if (!doc) return jsonError("文档不存在或无权限", 404, { headers });

    await prisma.readingProgress.upsert({
      where: { userId_documentId: { userId, documentId: body.documentId } },
      create: {
        userId,
        documentId: body.documentId,
        lastParagraphIdx: body.lastParagraphIdx,
        percent: body.percent,
      },
      update: {
        lastParagraphIdx: body.lastParagraphIdx,
        percent: body.percent,
      },
    });

    return jsonOk({ saved: true }, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "保存进度失败"), 400, { headers });
  }
}
