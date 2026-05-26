import { getErrorMessage } from "@/lib/error";
import type { ReaderAnalysisStatus } from "./documentAssets";

type ParagraphTranslation = {
  enText: string;
  zhText: string;
};

type CreateAssetsResult = {
  paragraphCount: number;
  sentenceCount: number;
  analysisStatus: ReaderAnalysisStatus;
};

export interface ImportWorkflowStore {
  updateDocument(
    documentId: string,
    data: {
      status: "READY" | "FAILED";
      analysisStatus: ReaderAnalysisStatus | "FAILED";
      error?: string | null;
      analysisError: string | null;
      analysisUpdatedAt: Date;
    },
  ): Promise<unknown>;
}

export async function completeDocumentImport(args: {
  store: ImportWorkflowStore;
  documentId: string;
  translatedParagraphs: ParagraphTranslation[];
  createAssets: (
    documentId: string,
    paragraphs: ParagraphTranslation[],
  ) => Promise<CreateAssetsResult>;
  startSentenceAnalysis: (
    documentId: string,
    mode: "missing",
  ) => Promise<unknown>;
}) {
  try {
    const assets = await args.createAssets(args.documentId, args.translatedParagraphs);

    await args.store.updateDocument(args.documentId, {
      status: "READY",
      analysisStatus: assets.analysisStatus,
      analysisError: null,
      analysisUpdatedAt: new Date(),
    });

    if (assets.sentenceCount > 0) {
      await args.startSentenceAnalysis(args.documentId, "missing");
    }

    return assets;
  } catch (error: unknown) {
    const message = getErrorMessage(error, "句子资产初始化失败");
    await args.store.updateDocument(args.documentId, {
      status: "FAILED",
      analysisStatus: "FAILED",
      error: message,
      analysisError: message,
      analysisUpdatedAt: new Date(),
    });
    throw error;
  }
}
