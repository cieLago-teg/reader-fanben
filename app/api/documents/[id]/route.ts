import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { buildDocumentDetailPayload, type SentenceAnalysisResult } from "@/lib/reader/documentAssets";
import { jsonError, jsonOk } from "../../_shared/response";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { id } = await params;

    const prisma = db();
    let effectiveUserId = userId;
    let doc = await prisma.document.findFirst({
      where: { id, userId: effectiveUserId },
      include: {
        paragraphs: {
          orderBy: { idx: "asc" },
          include: {
            sentences: {
              orderBy: { sentenceIdx: "asc" },
              include: { analysis: true },
            },
          },
        },
        progress: { where: { userId: effectiveUserId } },
        favorites: { where: { userId: effectiveUserId } },
      },
    });

    if (!doc) {
      const allowAdoptOwner =
        process.env.NODE_ENV !== "production" &&
        (req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1");

      if (allowAdoptOwner) {
        const owner = await prisma.document.findUnique({
          where: { id },
          select: { userId: true },
        });

        if (owner?.userId) {
          effectiveUserId = owner.userId;
          attachUserIdHeader(headers, effectiveUserId);

          doc = await prisma.document.findFirst({
            where: { id, userId: effectiveUserId },
            include: {
              paragraphs: {
                orderBy: { idx: "asc" },
                include: {
                  sentences: {
                    orderBy: { sentenceIdx: "asc" },
                    include: { analysis: true },
                  },
                },
              },
              progress: { where: { userId: effectiveUserId } },
              favorites: { where: { userId: effectiveUserId } },
            },
          });
        }
      }
    }

    if (!doc) return jsonError("文档不存在或无权限", 404, { headers });

    const progress = doc.progress[0] || null;
    const favored = doc.favorites.length > 0;

    return jsonOk(
      buildDocumentDetailPayload({
        document: {
          id: doc.id,
          title: doc.title,
          contentStatus: doc.status,
          analysisStatus: doc.analysisStatus,
          sourceType: doc.sourceType,
          sourceUrl: doc.sourceUrl,
          createdAt: doc.createdAt,
          analysisUpdatedAt: doc.analysisUpdatedAt,
        },
        paragraphs: doc.paragraphs.map((paragraph) => ({
          id: paragraph.id,
          idx: paragraph.idx,
          enText: paragraph.enText,
          zhText: paragraph.zhText,
          sentences: paragraph.sentences.map((sentence) => ({
            id: sentence.id,
            idx: sentence.idx,
            paragraphIdx: sentence.paragraphIdx,
            sentenceIdx: sentence.sentenceIdx,
            stableKey: sentence.stableKey,
            enText: sentence.enText,
            analysis: sentence.analysis
              ? {
                  status: sentence.analysis.status,
                  version: sentence.analysis.version,
                  provider: sentence.analysis.provider,
                  sourceType: sentence.analysis.sourceType,
                  updatedAt: sentence.analysis.updatedAt,
                  retryCount: sentence.analysis.retryCount,
                  error: sentence.analysis.error,
                  payload: sentence.analysis.payloadJson as SentenceAnalysisResult | null,
                }
              : null,
          })),
        })),
        progress,
        favored,
      }),
      { headers },
    );
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "读取失败"), 400, { headers });
  }
}
