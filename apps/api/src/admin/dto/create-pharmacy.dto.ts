import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  submissionDueDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  processingDueDay?: number;
}
