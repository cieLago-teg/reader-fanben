import { PrismaClient } from "@prisma/client";
import { segmentSentencesForParagraphs, type ReaderAnalysisStatus } from "./documentAssets";

type ParagraphTranslation = {
  enText: string;
  zhText: string;
};

export async function createReadableDocumentAssets(
  prisma: PrismaClient,
  documentId: string,
  paragraphs: ParagraphTranslation[],
): Promise<{ paragraphCount: number; sentenceCount: number; analysisStatus: ReaderAnalysisStatus }> {
  const createdParagraphs = await prisma.$transaction(
    paragraphs.map((paragraph, idx) =>
      prisma.paragraphPair.create({
        data: {
          documentId,
          idx,
          enText: paragraph.enText,
          zhText: paragraph.zhText,
        },
      }),
    ),
  );

  const sentenceSeeds = segmentSentencesForParagraphs(
    createdParagraphs.map((paragraph) => ({
      id: paragraph.id,
      idx: paragraph.idx,
      enText: paragraph.enText,
    })),
  );

  if (sentenceSeeds.length > 0) {
    await prisma.$transaction(
      sentenceSeeds.map((sentence) =>
        prisma.sentence.create({
          data: {
            documentId,
            paragraphId: sentence.paragraphId,
            idx: sentence.idx,
            paragraphIdx: sentence.paragraphIdx,
            sentenceIdx: sentence.sentenceIdx,
            stableKey: sentence.stableKey,
            enText: sentence.enText,
            analysis: {
              create: {
                status: "PENDING",
                sourceType: "SYSTEM",
              },
            },
          },
        }),
      ),
    );
  }

  return {
    paragraphCount: createdParagraphs.length,
    sentenceCount: sentenceSeeds.length,
    analysisStatus: sentenceSeeds.length > 0 ? "PENDING" : "READY",
  };
}
