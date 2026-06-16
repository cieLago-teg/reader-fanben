type ErrorWithMessage = {
  message?: string;
  shortMessage?: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
  code?: string;
};

function extractPrismaMessage(e: ErrorWithMessage): string | null {
  // Prisma 6/7: 优先 shortMessage（包含具体的字段、约束等可读信息）
  if (e.shortMessage && typeof e.shortMessage === "string" && e.shortMessage.trim()) {
    return e.shortMessage.trim();
  }
  // 兜底：message 里的第一行（Prisma 默认 message 经常带冗长的 stack-like 信息）
  if (e.message && typeof e.message === "string") {
    const firstLine = e.message.split("\n").find((l) => l.trim());
    if (firstLine && firstLine.trim()) return firstLine.trim();
  }
  return null;
}

export function getErrorMessage(e: unknown, fallback = "发生错误") {
  if (!e) return fallback;

  if (typeof e === "string") return e || fallback;

  if (typeof e === "object") {
    const err = e as ErrorWithMessage;

    const prismaMsg = extractPrismaMessage(err);
    if (prismaMsg) return prismaMsg;

    if (err.message && typeof err.message === "string" && err.message.trim()) {
      return err.message.trim();
    }
  }

  return fallback;
}

/**
 * 用于诊断日志的更详细错误信息。
 * 包含 shortMessage / code / meta 等 Prisma 关键字段，
 * 方便排查 "Invalid `prisma.xxx()` invocation" 这类无下文的报错。
 */
export function getErrorDetail(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) {
    const err = e as Error & ErrorWithMessage;
    const parts: string[] = [];
    if (err.message) parts.push(`message=${err.message.split("\n")[0]}`);
    if (err.code) parts.push(`code=${err.code}`);
    if (err.shortMessage) parts.push(`shortMessage=${err.shortMessage}`);
    if (err.meta && Object.keys(err.meta).length) {
      parts.push(`meta=${JSON.stringify(err.meta)}`);
    }
    return parts.join(" | ") || err.name || "Error";
  }
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

