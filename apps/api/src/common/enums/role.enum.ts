// System-level roles (matches Prisma Role enum)
export enum Role {
  ADMIN = 'ADMIN',
  COMPANY_MANAGER = 'COMPANY_MANAGER',
  PHARMACY_ADMIN = 'PHARMACY_ADMIN',
  PHARMACY_USER = 'PHARMACY_USER',
  READ_ONLY = 'READ_ONLY',
}

// Pharmacy-level roles (matches Prisma MemberRole enum)
export enum MemberRole {
  PHARMACY_ADMIN = 'PHARMACY_ADMIN',
  PHARMACY_USER = 'PHARMACY_USER',
  READ_ONLY = 'READ_ONLY',
}
