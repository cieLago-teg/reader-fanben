import { NextRequest } from "next/server";
import { z } from "zod";
import { getOrCreateUserId, attachUserIdHeader } from "@/lib/requestUser";
import { lookupWord } from "@/lib/lexicon";
import { getClientIp, rateLimitOrThrow } from "@/lib/security/rateLimit";
import { getErrorMessage } from "@/lib/error";
import { jsonError, jsonOk } from "../_shared/response";

export const runtime = "nodejs";

const BodySchema = z.object({
  word: z.string().min(1).max(100),
  context: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const headers = new Headers();
  try {
    rateLimitOrThrow(`lookup:${getClientIp(req.headers)}`, 120, 60_000);
    const userId = await getOrCreateUserId(req);
    attachUserIdHeader(headers, userId);

    const body = BodySchema.parse(await req.json());
    const result = await lookupWord(body.word, body.context);
    return jsonOk(result, { headers });
  } catch (e: unknown) {
    return jsonError(getErrorMessage(e, "查词失败"), 400, { headers });
  }
}
