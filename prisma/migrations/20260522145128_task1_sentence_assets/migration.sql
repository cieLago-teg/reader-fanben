-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisSourceType" AS ENUM ('SYSTEM', 'AI', 'MANUAL');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "analysisError" TEXT,
ADD COLUMN     "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "analysisUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Sentence" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "paragraphId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "paragraphIdx" INTEGER NOT NULL,
    "sentenceIdx" INTEGER NOT NULL,
    "stableKey" TEXT NOT NULL,
    "enText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentenceAnalysis" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" "AnalysisSourceType" NOT NULL DEFAULT 'SYSTEM',
    "provider" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" JSONB,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentenceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sentence_paragraphId_sentenceIdx_idx" ON "Sentence"("paragraphId", "sentenceIdx");

-- CreateIndex
CREATE INDEX "Sentence_documentId_paragraphIdx_sentenceIdx_idx" ON "Sentence"("documentId", "paragraphIdx", "sentenceIdx");

-- CreateIndex
CREATE UNIQUE INDEX "Sentence_documentId_idx_key" ON "Sentence"("documentId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "Sentence_documentId_stableKey_key" ON "Sentence"("documentId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "SentenceAnalysis_sentenceId_key" ON "SentenceAnalysis"("sentenceId");

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "ParagraphPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAnalysis" ADD CONSTRAINT "SentenceAnalysis_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
