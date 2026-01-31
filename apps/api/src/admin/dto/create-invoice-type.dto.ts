import { IsString, IsOptional, IsBoolean, MaxLength, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInvoiceTypeDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  orgId?: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
