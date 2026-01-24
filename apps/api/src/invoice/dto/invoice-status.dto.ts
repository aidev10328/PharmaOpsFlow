import { IsString, IsOptional, MaxLength } from 'class-validator';

export class InvoiceStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
