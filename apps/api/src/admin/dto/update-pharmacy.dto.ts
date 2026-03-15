import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdatePharmacyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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
