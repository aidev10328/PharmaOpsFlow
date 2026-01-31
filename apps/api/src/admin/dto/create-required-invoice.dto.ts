import { IsUUID, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRequiredInvoiceDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => (value === '' ? undefined : value))
  orgId?: string;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsUUID()
  invoiceTypeId: string;
}
