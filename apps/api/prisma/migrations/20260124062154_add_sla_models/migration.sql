-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('SUBMISSION_MISSED', 'PROCESSING_MISSED', 'SUBMISSION_REMINDER_SENT', 'PROCESSING_REMINDER_SENT');

-- CreateTable
CREATE TABLE "MonthlyInvoiceRequirement" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 1,
    "submittedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "isMet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyInvoiceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaEvent" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "eventType" "SlaEventType" NOT NULL,
    "invoiceId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyInvoiceRequirement_pharmacyId_idx" ON "MonthlyInvoiceRequirement"("pharmacyId");

-- CreateIndex
CREATE INDEX "MonthlyInvoiceRequirement_yearMonth_idx" ON "MonthlyInvoiceRequirement"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyInvoiceRequirement_pharmacyId_yearMonth_key" ON "MonthlyInvoiceRequirement"("pharmacyId", "yearMonth");

-- CreateIndex
CREATE INDEX "SlaEvent_pharmacyId_idx" ON "SlaEvent"("pharmacyId");

-- CreateIndex
CREATE INDEX "SlaEvent_pharmacyId_yearMonth_idx" ON "SlaEvent"("pharmacyId", "yearMonth");

-- CreateIndex
CREATE INDEX "SlaEvent_yearMonth_eventType_idx" ON "SlaEvent"("yearMonth", "eventType");

-- CreateIndex
CREATE INDEX "NotificationLog_pharmacyId_idx" ON "NotificationLog"("pharmacyId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_type_sentAt_idx" ON "NotificationLog"("type", "sentAt");

-- AddForeignKey
ALTER TABLE "MonthlyInvoiceRequirement" ADD CONSTRAINT "MonthlyInvoiceRequirement_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaEvent" ADD CONSTRAINT "SlaEvent_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaEvent" ADD CONSTRAINT "SlaEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
