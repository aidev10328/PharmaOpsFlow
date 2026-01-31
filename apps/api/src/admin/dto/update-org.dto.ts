import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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
