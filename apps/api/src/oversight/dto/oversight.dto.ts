import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

// =============================================
// Query DTOs
// =============================================

export class OversightInvoiceQueryDto {
  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  overdueOnly?: string; // "true"/"false" from query param

  @IsOptional()
  @IsString()
  needsReview?: string; // "true"/"false"

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class OversightSlaEventsQueryDto {
  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class OversightSlaSummaryQueryDto {
  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM
}

export class OversightNotificationQueryDto {
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// =============================================
// Intervention DTOs
// =============================================

export class OverrideStatusDto {
  @IsEnum(InvoiceStatus)
  newStatus: InvoiceStatus;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class UnlockInvoiceDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class ReassignPharmacyDto {
  @IsUUID()
  newPharmacyId: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
