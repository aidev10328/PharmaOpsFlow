import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTicketDto {
  @IsEnum(['BUG', 'FUNCTIONAL_ISSUE', 'PERFORMANCE_ISSUE', 'UI_UX_ISSUE', 'DATA_ISSUE', 'QUESTION', 'FEATURE_REQUEST'])
  issueType: string;

  @IsOptional()
  @IsString()
  userTitle?: string;

  @IsNotEmpty()
  @IsString()
  userDescription: string;

  @IsOptional()
  @IsString()
  voiceTranscript?: string;

  @IsEnum(['BLOCKING', 'MAJOR', 'MINOR', 'COSMETIC', 'SUGGESTION'])
  businessImpact: string;

  // Structured fields (from review screen)
  @IsOptional()
  @IsString()
  structuredTitle?: string;

  @IsOptional()
  @IsString()
  structuredSummary?: string;

  @IsOptional()
  stepsToReproduce?: string[];

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  category?: string;

  // Context (auto-captured by frontend)
  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;

  @IsOptional()
  @IsString()
  pageRoute?: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  browserInfo?: any;

  @IsOptional()
  viewportInfo?: any;

  @IsOptional()
  consoleErrors?: any;

  @IsOptional()
  failedApiRequests?: any;

  @IsOptional()
  metadata?: any;
}
