-- AlterTable: Replace Pharmacy.address with separate address fields + phone + website
ALTER TABLE "Pharmacy" DROP COLUMN "address",
ADD COLUMN "street" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "zip" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "website" TEXT;

-- AlterTable: Add phone to User
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
