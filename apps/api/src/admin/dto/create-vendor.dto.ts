import { IsString, IsOptional, IsUUID, MaxLength, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateVendorDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  orgId?: string;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentTerms?: string;
}
