import { IsString, IsOptional, IsUUID, MaxLength, IsEmail } from 'class-validator';

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

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
