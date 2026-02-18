import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsUUID,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequirementFrequency, RequirementInstanceStatus } from '@prisma/client';

export class CreateRequirementDto {
  @IsUUID()
  pharmacyId: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RequirementFrequency)
  frequency: RequirementFrequency;

  @IsNumber()
  @Min(1)
  @Max(28)
  submissionDueDay: number;

  @IsNumber()
  @Min(1)
  @Max(28)
  processingDueDay: number;

  @IsOptional()
  @IsString()
  applicableMonths?: string; // e.g., "3,6,9,12" for quarterly
}

export class UpdateRequirementDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RequirementFrequency)
  frequency?: RequirementFrequency;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  submissionDueDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  processingDueDay?: number;

  @IsOptional()
  @IsString()
  applicableMonths?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RequirementFiltersDto {
  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsOptional()
  @IsEnum(RequirementFrequency)
  frequency?: RequirementFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InstanceFiltersDto {
  @IsOptional()
  @IsUUID()
  requirementId?: string;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsEnum(RequirementInstanceStatus)
  status?: RequirementInstanceStatus;

  @IsOptional()
  @IsString()
  periodLabel?: string; // e.g., "January 2025"

  @IsOptional()
  @IsString()
  yearMonth?: string; // YYYY-MM format

  @IsOptional()
  @IsBoolean()
  overdueOnly?: boolean;
}

export class LinkInvoiceDto {
  @IsUUID()
  invoiceId: string;
}

export class GenerateInstancesDto {
  @IsOptional()
  @IsUUID()
  pharmacyId?: string; // Generate for specific pharmacy, or all if not specified

  @IsString()
  startMonth: string; // YYYY-MM format

  @IsOptional()
  @IsString()
  endMonth?: string; // YYYY-MM format (defaults to startMonth)
}

// Response types
export interface RequirementResponse {
  id: string;
  pharmacyId: string;
  pharmacy: { id: string; name: string; code: string };
  vendorId: string | null;
  vendor: { id: string; name: string } | null;
  invoiceTypeId: string | null;
  invoiceType: { id: string; name: string } | null;
  name: string;
  description: string | null;
  frequency: RequirementFrequency;
  submissionDueDay: number;
  processingDueDay: number;
  applicableMonths: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceResponse {
  id: string;
  requirementId: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  invoiceId: string | null;
  invoice: { id: string; invoiceNumber: string | null; status: string } | null;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  submissionDeadline: Date;
  processingDeadline: Date;
  status: RequirementInstanceStatus;
  submittedAt: Date | null;
  processedAt: Date | null;
  submissionMet: boolean | null;
  processingMet: boolean | null;
  lastEvaluatedAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

export interface ComplianceSummary {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  totalRequirements: number;
  pending: number;
  submitted: number;
  processed: number;
  overdue: number;
  missed: number;
  complianceRate: number;
}

export interface GenerateResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface PharmacyRequirementsSummary {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  pending: number;
  overdue: number;
  submitted: number;
  processed: number;
  totalThisMonth: number;
}
