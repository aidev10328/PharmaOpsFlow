/*
  Warnings:

  - You are about to drop the column `fileName` on the `InvoiceFile` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `InvoiceFile` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `InvoiceFile` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `InvoiceFile` table. All the data in the column will be lost.
  - Added the required column `mimeType` to the `InvoiceFile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalName` to the `InvoiceFile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sizeBytes` to the `InvoiceFile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploadedByUserId` to the `InvoiceFile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "InvoiceFile" DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "fileType",
DROP COLUMN "uploadedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "originalName" TEXT NOT NULL,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ADD COLUMN     "uploadedByUserId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
