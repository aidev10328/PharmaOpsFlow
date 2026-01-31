import { IsUUID } from 'class-validator';

export class MergeVendorDto {
  @IsUUID()
  targetVendorId: string;
}
