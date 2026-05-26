import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { normalizeSentenceAnalysisResult } from "./documentAssets";

const ChunkSchema = z.object({
  text: z.string().trim().min(1),
  gloss: z.string().trim().min(1).nullable().optional(),
  role: z.string().trim().min(1).nullable().optional(),
});

const StructureSchema = z.object({
  id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  annotationIds: z.array(z.string().trim().min(1)).optional(),
});

const InlineAnnotationSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    color: z.enum(["amber", "teal", "violet", "rose", "sky"]),
    label: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    role: z.string().trim().min(1).nullable().optional(),
  })
  .refine((annotation) => annotation.end >= annotation.start, {
    message: "inlineAnnotations end 必须大于或等于 start",
    path: ["end"],
  });

const SentenceAnalysisResultSchema = z.object({
  translation: z.string().trim().min(1),
  chunks: z.array(ChunkSchema).min(1),
  inlineAnnotations: z.array(InlineAnnotationSchema).min(1).optional(),
  structure: z.array(StructureSchema).default([]),
  notes: z.array(z.string().trim().min(1)).min(1),
});

const ManualRefineBodySchema = z.object({
  sentenceId: z.string().trim().min(1),
  stableKey: z.string().trim().min(1),
  expectedVersion: z.number().int().min(0),
  result: SentenceAnalysisResultSchema,
});

export class ManualRefineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualRefineValidationError";
  }
}

export class ManualRefineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualRefineConflictError";
  }
}

export type ManualRefineBody = z.infer<typeof ManualRefineBodySchema>;

export function validateManualRefineBody(input: unknown): ManualRefineBody {
  const parsed = ManualRefineBodySchema.safeParse(input);
  if (!parsed.success) {
    throw new ManualRefineValidationError(parsed.error.issues[0]?.message || "人工精修结果格式不正确");
  }
  return parsed.data;
}

export function buildManualRefineUpdate(args: {
  currentStableKey: string;
  currentSentenceText: string;
  currentVersion: number;
  provider?: string | null;
  body: ManualRefineBody;
}) {
  if (args.currentStableKey !== args.body.stableKey) {
    throw new ManualRefineConflictError("句子 stableKey 与当前记录不一致，无法覆盖更新");
  }

  if (args.currentVersion !== args.body.expectedVersion) {
    throw new ManualRefineConflictError("句子解析版本已变化，请刷新后再提交");
  }

  const payloadJson = normalizeSentenceAnalysisResult(args.currentSentenceText, {
    translation: args.body.result.translation,
    chunks: args.body.result.chunks.map((chunk) => ({
      text: chunk.text,
      gloss: chunk.gloss ?? null,
      role: chunk.role ?? null,
    })),
    inlineAnnotations: args.body.result.inlineAnnotations?.map((annotation) => ({
      id: annotation.id,
      text: annotation.text,
      start: annotation.start,
      end: annotation.end,
      color: annotation.color,
      label: annotation.label,
      detail: annotation.detail,
      role: annotation.role ?? null,
    })),
    structure: args.body.result.structure.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      annotationIds: item.annotationIds,
    })),
    notes: [...args.body.result.notes],
  })!;

  const nextVersion = Math.max(1, args.currentVersion + 1);

  return {
    status: "READY" as const,
    sourceType: "MANUAL" as const,
    provider: "manual-refine",
    version: nextVersion,
    retryCount: 0,
    error: null,
    payloadJson,
    completedAt: new Date(),
  } satisfies Prisma.SentenceAnalysisUncheckedUpdateInput;
}
