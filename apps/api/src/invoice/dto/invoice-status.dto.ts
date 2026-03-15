import { IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class InvoiceStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string; // For schedule action: when payment is scheduled

  @IsOptional()
  @IsDateString()
  paidDate?: string; // For paid action: actual payment date
}
