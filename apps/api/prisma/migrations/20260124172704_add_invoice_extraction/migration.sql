-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('NONE', 'PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('GEMINI', 'OPENAI', 'ANTHROPIC', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvoiceEventType" ADD VALUE 'EXTRACTION_STARTED';
ALTER TYPE "InvoiceEventType" ADD VALUE 'EXTRACTION_COMPLETED';
ALTER TYPE "InvoiceEventType" ADD VALUE 'EXTRACTION_FAILED';
ALTER TYPE "InvoiceEventType" ADD VALUE 'EXTRACTION_APPLIED';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "extractedAt" TIMESTAMP(3),
ADD COLUMN     "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "lastExtractionId" TEXT,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "vendorId" DROP NOT NULL,
ALTER COLUMN "invoiceTypeId" DROP NOT NULL,
ALTER COLUMN "invoiceNumber" DROP NOT NULL,
ALTER COLUMN "invoiceDate" DROP NOT NULL,
ALTER COLUMN "dueDate" DROP NOT NULL,
ALTER COLUMN "amount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InvoiceExtraction" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceFileId" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT,
    "extractedJson" JSONB NOT NULL,
    "confidenceJson" JSONB NOT NULL,
    "rawText" TEXT,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceExtraction_invoiceId_idx" ON "InvoiceExtraction"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceExtraction_invoiceId_createdAt_idx" ON "InvoiceExtraction"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceExtraction_status_idx" ON "InvoiceExtraction"("status");

-- CreateIndex
CREATE INDEX "Invoice_pharmacyId_needsReview_status_idx" ON "Invoice"("pharmacyId", "needsReview", "status");

-- AddForeignKey
ALTER TABLE "InvoiceExtraction" ADD CONSTRAINT "InvoiceExtraction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceExtraction" ADD CONSTRAINT "InvoiceExtraction_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "InvoiceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
