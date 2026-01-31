import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsUUID()
  orgId?: string;
}
