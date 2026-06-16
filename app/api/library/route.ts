import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage, getErrorDetail } from "@/lib/error";
import { buildLibraryDocumentItem } from "@/lib/reader/documentAssets";
import { jsonError, jsonOk } from "../_shared/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const prisma = db();
    const docs = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        progress: { where: { userId } },
        favorites: { where: { userId } },
        sentences: {
          select: {
            analysis: {
              select: { status: true },
            },
          },
        },
      },
    });

    return jsonOk(
      docs.map((d) => {
        const analysisCounts = {
          total: d.sentences.length,
          ready: 0,
          processing: 0,
          pending: 0,
          failed: 0,
        };

        for (const sentence of d.sentences) {
          const status = sentence.analysis?.status ?? "PENDING";
          if (status === "READY") analysisCounts.ready += 1;
          if (status === "PROCESSING") analysisCounts.processing += 1;
          if (status === "FAILED") analysisCounts.failed += 1;
          if (status === "PENDING") analysisCounts.pending += 1;
        }

        return buildLibraryDocumentItem({
          id: d.id,
          title: d.title,
          contentStatus: d.status,
          analysisStatus: d.analysisStatus,
          createdAt: d.createdAt,
          favored: d.favorites.length > 0,
          percent: d.progress[0]?.percent ?? 0,
          sentenceCount: d.sentences.length,
          analysisCounts,
        });
      }),
      { headers },
    );
  } catch (e: unknown) {
    // 详细错误信息打到 server 日志，便于排查 "Invalid `prisma.xxx()` invocation:" 这种上下文缺失的报错
    console.error("[api/library] error:", getErrorDetail(e));
    return jsonError(getErrorMessage(e, "获取列表失败"), 400, { headers });
  }
}
