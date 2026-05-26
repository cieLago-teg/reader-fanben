import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { normalizeSelectedWord } from "@/lib/lexicon/normalize";
import { lookupWord } from "@/lib/lexicon";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../_shared/response";

export const runtime = "nodejs";

const PostSchema = z.object({
  word: z.string().min(1).max(100),
  documentId: z.string().optional(),
  sourceContext: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const url = new URL(req.url);
    const documentId = url.searchParams.get("documentId") || undefined;

    const prisma = db();
    const items = await prisma.vocabItem.findMany({
      where: { userId, ...(documentId ? { documentId } : {}) },
      orderBy: { addedAt: "desc" },
      take: 200,
    });

    return jsonOk(items, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "获取生词本失败"), 400, { headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const body = PostSchema.parse(await req.json());
    const normalized = normalizeSelectedWord(body.word);
    if (!normalized) return jsonError("请选择一个有效单词", 400, { headers });

    const payload = await lookupWord(normalized);

    const prisma = db();
    const existing = await prisma.vocabItem.findFirst({
      where: { userId, normalized },
      orderBy: { addedAt: "desc" },
    });

    const created = existing
      ? await prisma.vocabItem.update({
          where: { id: existing.id },
          data: {
            documentId: body.documentId,
            word: body.word,
            payloadJson: payload,
            sourceContext: body.sourceContext,
          },
        })
      : await prisma.vocabItem.create({
          data: {
            userId,
            documentId: body.documentId,
            word: body.word,
            normalized,
            payloadJson: payload,
            sourceContext: body.sourceContext,
          },
        });

    return jsonOk(created, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "添加生词失败"), 400, { headers });
  }
}
