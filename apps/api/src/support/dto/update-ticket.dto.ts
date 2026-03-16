import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTicketStatusDto {
  @IsEnum(['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'NEED_MORE_INFO', 'FIXED', 'RELEASED', 'CLOSED'])
  newStatus: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTicketDto {
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
}
