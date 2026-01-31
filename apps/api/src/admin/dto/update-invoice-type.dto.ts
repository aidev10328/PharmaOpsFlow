import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateInvoiceTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
