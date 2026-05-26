import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { attachUserIdHeader, getOrCreateUserId } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { buildManualRefineUpdate, ManualRefineConflictError, validateManualRefineBody } from "@/lib/reader/manualRefine";
import { startDocumentSentenceAnalysis } from "@/lib/reader/sentenceAnalysis";
import { jsonError, jsonOk } from "../../../_shared/response";

export const runtime = "nodejs";

const BodySchema = z.object({
  mode: z.enum(["missing", "failed", "all"]).optional(),
  sentenceId: z.string().min(1).optional(),
});

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
    const body = raw ? BodySchema.parse(JSON.parse(raw)) : {};

    const prisma = db();
    const doc = await prisma.document.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!doc) {
      return jsonError("文档不存在或无权限", 404, { headers });
    }

    if (body.sentenceId) {
      const sentence = await prisma.sentence.findFirst({
        where: { id: body.sentenceId, documentId: id },
        select: { id: true },
      });
      if (!sentence) {
        return jsonError("句子不存在或不属于当前文章", 404, { headers });
      }
    }

    const mode = body.mode ?? (body.sentenceId ? "all" : "missing");
    const job = await startDocumentSentenceAnalysis({
      documentId: id,
      mode,
      sentenceId: body.sentenceId,
    });

    return jsonOk(job, { headers });
  } catch (error: unknown) {
    return jsonError(getErrorMessage(error, "触发句子解析失败"), 400, { headers });
  }
}

function resolveDocumentAnalysisStatus(statuses: Array<"PENDING" | "PROCESSING" | "READY" | "FAILED">) {
  if (statuses.some((status) => status === "PROCESSING")) return "PROCESSING" as const;
  if (statuses.some((status) => status === "PENDING")) return "PENDING" as const;
  if (statuses.some((status) => status === "FAILED")) return "FAILED" as const;
  return "READY" as const;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { id } = await params;
    const raw = await req.text();
    const body = validateManualRefineBody(raw ? JSON.parse(raw) : null);

    const prisma = db();
    const sentence = await prisma.sentence.findFirst({
      where: {
        id: body.sentenceId,
        documentId: id,
        document: { userId },
      },
      include: {
        analysis: true,
      },
    });

    if (!sentence) {
      return jsonError("句子不存在或不属于当前文章", 404, { headers });
    }

    const update = buildManualRefineUpdate({
      currentStableKey: sentence.stableKey,
      currentSentenceText: sentence.enText,
      currentVersion: sentence.analysis?.version ?? 0,
      provider: sentence.analysis?.provider,
      body,
    });

    const updatedAnalysis = sentence.analysis
      ? await prisma.sentenceAnalysis.update({
          where: { sentenceId: sentence.id },
          data: update,
        })
      : await prisma.sentenceAnalysis.create({
          data: {
            sentenceId: sentence.id,
            requestedAt: new Date(),
            ...update,
          },
        });

    const statuses = (
      await prisma.sentence.findMany({
        where: { documentId: id },
        select: {
          analysis: {
            select: {
              status: true,
            },
          },
        },
      })
    ).map((item) => item.analysis?.status ?? "PENDING");

    await prisma.document.update({
      where: { id },
      data: {
        analysisStatus: resolveDocumentAnalysisStatus(statuses),
        analysisUpdatedAt: new Date(),
        analysisError: null,
      },
    });

    return jsonOk(
      {
        sentenceId: sentence.id,
        version: updatedAnalysis.version,
        sourceType: updatedAnalysis.sourceType,
        status: updatedAnalysis.status,
        updatedAt: updatedAnalysis.updatedAt.toISOString(),
      },
      { headers },
    );
  } catch (error: unknown) {
    if (error instanceof ManualRefineConflictError) {
      return jsonError(error.message, 409, { headers });
    }
    return jsonError(getErrorMessage(error, "保存人工精修失败"), 400, { headers });
  }
}
