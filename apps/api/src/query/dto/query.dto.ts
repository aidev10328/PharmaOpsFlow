import { IsOptional, IsString, IsArray, IsBoolean, IsNumber, IsEnum, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeDto {
  @IsOptional()
  @IsString()
  from?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  to?: string; // YYYY-MM-DD
}

export class AmountRangeDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;
}

export class SortDto {
  @IsString()
  field: 'dueDate' | 'amount' | 'createdAt' | 'invoiceDate' | 'submittedAt';

  @IsEnum(['asc', 'desc'])
  direction: 'asc' | 'desc';
}

export class InvoiceFiltersDto {
  @IsOptional()
  @IsString()
  orgId?: string; // Always set from authenticated user

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedPharmacyIds?: string[]; // For COMPANY_MANAGER: only show assigned pharmacies

  @IsOptional()
  @IsString()
  pharmacyId?: string;

  @IsOptional()
  @IsString()
  pharmacyCode?: string;

  @IsOptional()
  @IsString()
  invoiceType?: string; // Invoice type name

  @IsOptional()
  @IsString()
  invoiceTypeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statusIn?: string[];

  @IsOptional()
  @IsBoolean()
  needsReview?: boolean;

  @IsOptional()
  @IsBoolean()
  overdueOnly?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dueDateRange?: DateRangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AmountRangeDto)
  amountRange?: AmountRangeDto;

  @IsOptional()
  @IsString()
  vendorNameContains?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM format

  @IsOptional()
  @IsString()
  invoiceId?: string; // For detail queries
}

export class PaginationDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class InvoiceSearchDto extends PaginationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceFiltersDto)
  filters?: InvoiceFiltersDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortDto)
  sort?: SortDto[];
}

export type GroupByType = 'pharmacy' | 'invoiceType' | 'status' | 'vendor';

export class InvoiceSummaryDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceFiltersDto)
  filters?: InvoiceFiltersDto;

  @IsOptional()
  @IsEnum(['pharmacy', 'invoiceType', 'status', 'vendor'])
  groupBy?: GroupByType;
}

export class SlaSummaryDto {
  @IsString()
  month: string; // YYYY-MM format

  @IsOptional()
  @IsString()
  orgId?: string;
}

// Query Plan types for LLM integration
export type QueryIntent = 'invoice_search' | 'invoice_summary' | 'sla_summary' | 'invoice_detail' | 'help';

export class QueryPlanDto {
  @IsEnum(['invoice_search', 'invoice_summary', 'sla_summary', 'invoice_detail', 'help'])
  intent: QueryIntent;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceFiltersDto)
  filters?: InvoiceFiltersDto;

  @IsOptional()
  @IsEnum(['pharmacy', 'invoiceType', 'status', 'vendor'])
  groupBy?: GroupByType | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortDto)
  sort?: SortDto[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  helpResponse?: string; // Response text for help intent
}

// Response types
export interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  pharmacy: { id: string; name: string; code: string };
  invoiceType: { id: string; name: string } | null;
  vendor: { id: string; name: string; code: string } | null;
  amount: number | null;
  dueDate: Date | null;
  invoiceDate: Date | null;
  status: string;
  needsReview: boolean;
  submittedAt: Date | null;
  createdAt: Date;
}

export interface SearchResult {
  rows: InvoiceRow[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SummaryMetrics {
  count: number;
  sumAmount: number;
  sumPaid: number;
  avgAmount: number;
  avgCycleDays: number | null;
}

export interface GroupedSummary {
  groupKey: string;
  groupLabel: string;
  metrics: SummaryMetrics;
}

export interface SummaryResult {
  overall: SummaryMetrics;
  groups: GroupedSummary[];
}

export interface SlaSummaryResult {
  month: string;
  pharmacies: Array<{
    pharmacyId: string;
    pharmacyName: string;
    pharmacyCode: string;
    submissionMissed: number;
    processingMissed: number;
    pending: number;
    totalExpected: number;
    submittedCount: number;
    processedCount: number;
    complianceRate: number;
  }>;
  totals: {
    totalPharmacies: number;
    compliantPharmacies: number;
    submissionMissedTotal: number;
    processingMissedTotal: number;
  };
}

export interface FilterChip {
  key: string;
  label: string;
  value: string | number | boolean;
  removable: boolean;
}
