import { NextRequest } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { segmentParagraphs, normalizeText } from "@/lib/extract/segment";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { createReadableDocumentAssets } from "@/lib/reader/persistDocumentAssets";
import { startDocumentSentenceAnalysis } from "@/lib/reader/sentenceAnalysis";
import { completeDocumentImport } from "@/lib/reader/importWorkflow";
import { translateWithCache } from "@/lib/translate";
import { getClientIp, rateLimitOrThrow } from "@/lib/security/rateLimit";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../../_shared/response";

export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  text: z.string().min(20),
});

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    rateLimitOrThrow(`import-text:${getClientIp(req.headers)}`, 20, 60_000);
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const body = BodySchema.parse(await req.json());
    const title = body.title.trim();
    const text = normalizeText(body.text);
    const paragraphs = segmentParagraphs(text);

    const prisma = db();
    const doc = await prisma.document.create({
      data: {
        userId,
        title,
        sourceType: "PASTE",
        status: "PROCESSING",
      },
    });

    try {
      const limit = pLimit(3);
      const translated = await Promise.all(
        paragraphs.map((p) =>
          limit(async () => {
            const { zhText } = await translateWithCache(p);
            return { enText: p, zhText };
          }),
        ),
      );

      await completeDocumentImport({
        store: {
          updateDocument(documentId, data) {
            return prisma.document.update({
              where: { id: documentId },
              data,
            });
          },
        },
        documentId: doc.id,
        translatedParagraphs: translated,
        createAssets(documentId, paragraphs) {
          return createReadableDocumentAssets(prisma, documentId, paragraphs);
        },
        startSentenceAnalysis(documentId, mode) {
          return startDocumentSentenceAnalysis({ documentId, mode });
        },
      });
    } catch (err: unknown) {
      throw err;
    }

    return jsonOk({ documentId: doc.id }, { headers });
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "导入失败");
    return jsonError(msg, 400, { headers });
  }
}
