import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../_shared/response";

export const runtime = "nodejs";

const PostSchema = z.object({
  documentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { documentId } = PostSchema.parse(await req.json());

    const prisma = db();
    const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!doc) return jsonError("文档不存在或无权限", 404, { headers });

    await prisma.favorite.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId },
      update: {},
    });

    return jsonOk({ favored: true }, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "收藏失败"), 400, { headers });
  }
}
