import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../../_shared/response";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = new Headers();
  try {
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const { id } = await params;
    const prisma = db();
    await prisma.vocabItem.deleteMany({ where: { id, userId } });
    return jsonOk({ deleted: true }, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "删除失败"), 400, { headers });
  }
}
