import { IsString, IsOptional, MaxLength, IsInt, Min } from 'class-validator';

export class CreateInvoiceCategoryDto {
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
