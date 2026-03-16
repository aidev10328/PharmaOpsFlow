-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SLA_SUBMISSION_REMINDER', 'SLA_PROCESSING_REMINDER', 'SLA_SUBMISSION_VIOLATION', 'SLA_PROCESSING_VIOLATION', 'INVOICE_SUBMITTED', 'INVOICE_APPROVED', 'INVOICE_REJECTED', 'INVOICE_OVERDUE', 'AI_EXTRACTION_FAILED', 'USER_REGISTERED', 'PHARMACY_DEACTIVATED');

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" JSONB NOT NULL DEFAULT '["in_app"]',
    "config" JSONB,
    "recipientRoles" JSONB NOT NULL DEFAULT '["ADMIN"]',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPreference_orgId_idx" ON "NotificationPreference"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_orgId_notificationType_key" ON "NotificationPreference"("orgId", "notificationType");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
