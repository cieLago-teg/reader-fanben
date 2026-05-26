import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../../_shared/response";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { documentId } = await params;
    const prisma = db();
    await prisma.favorite.deleteMany({ where: { userId, documentId } });
    return jsonOk({ favored: false }, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "取消收藏失败"), 400, { headers });
  }
}
