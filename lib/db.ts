import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
}

export function db() {
  if (!global.__prisma) {
    const configuredUrl = process.env.DATABASE_URL?.trim();
    const connectionString =
      configuredUrl && !configuredUrl.startsWith("file:")
        ? configuredUrl
        : "postgresql://postgres:postgres@localhost:5432/reader_fanben?schema=public";
    const adapter = new PrismaPg({ connectionString });
    global.__prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return global.__prisma;
}
