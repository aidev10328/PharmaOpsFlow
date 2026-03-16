import { IsBoolean, IsOptional, IsArray, IsString, IsObject } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientRoles?: string[];
}
