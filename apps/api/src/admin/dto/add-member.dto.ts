import { IsUUID, IsEnum } from 'class-validator';
import { MemberRole } from '../../common/enums/role.enum';

export class AddMemberDto {
  @IsUUID()
  userId: string;

  @IsEnum(MemberRole)
  memberRole: MemberRole;
}
