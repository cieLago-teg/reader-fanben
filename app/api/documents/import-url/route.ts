import { NextRequest } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { extractFromUrl } from "@/lib/extract/extractFromUrl";
import { segmentParagraphs } from "@/lib/extract/segment";
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
  url: z.string().min(5),
  title: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    rateLimitOrThrow(`import-url:${getClientIp(req.headers)}`, 10, 60_000);
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const body = BodySchema.parse(await req.json());
    const extracted = await extractFromUrl(body.url);
    const title = body.title?.trim() || extracted.title || "未命名文章";
    const paragraphs = segmentParagraphs(extracted.text);

    const prisma = db();
    const doc = await prisma.document.create({
      data: {
        userId,
        title,
        sourceType: "URL",
        sourceUrl: body.url,
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
