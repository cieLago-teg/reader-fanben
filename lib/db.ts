import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var __prisma: PrismaClient | undefined;
  var __pgPool: Pool | undefined;
}

/**
 * 重要：延迟初始化 Prisma Client。
 * Next.js 16 在 build 阶段会“加载”路由模块做分析；如果 Prisma 在模块顶层立即初始化，
 * 可能导致构建阶段在非预期 runtime 下触发 Prisma engine 校验失败。
 */
export function db() {
  if (!global.__prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("缺少 DATABASE_URL 环境变量");
    }

    // Prisma 7 推荐：使用 driver adapter（pg）
    const pool =
      global.__pgPool ??
      new Pool({
        connectionString,
      });
    global.__pgPool = pool;

    global.__prisma = new PrismaClient({
      adapter: new PrismaPg(pool),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return global.__prisma;
}
