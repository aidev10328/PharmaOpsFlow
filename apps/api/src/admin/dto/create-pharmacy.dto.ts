import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePharmacyDto {
  @IsUUID()
  orgId: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(20)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}
