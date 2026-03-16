import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddCommentDto {
  @IsNotEmpty()
  @IsString()
  commentText: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
