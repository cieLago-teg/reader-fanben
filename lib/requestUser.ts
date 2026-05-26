import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "./db";

/**
 * MVP：匿名用户。
 * - 前端第一次请求时若无 x-user-id，则后端生成一个并通过响应头返回；
 * - 前端把它存到 localStorage 并在后续请求里带上。
 */
export async function getOrCreateUserId(req: NextRequest): Promise<string> {
  const headerUserId = req.headers.get("x-user-id");
  const userId = headerUserId?.trim() || randomUUID();

  const prisma = db();
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  });

  return userId;
}

export function attachUserIdHeader(headers: Headers, userId: string) {
  headers.set("x-user-id", userId);
}
