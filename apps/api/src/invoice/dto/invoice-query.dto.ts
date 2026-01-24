import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum InvoiceStatusFilter {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  NEEDS_INFO = 'NEEDS_INFO',
  APPROVED = 'APPROVED',
  SCHEDULED = 'SCHEDULED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

export class InvoiceQueryDto {
  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatusFilter)
  status?: InvoiceStatusFilter;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
