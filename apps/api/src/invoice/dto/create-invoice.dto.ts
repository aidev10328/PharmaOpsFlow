import {
  IsString,
  IsUUID,
  IsDateString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';

export type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';

export class CreateInvoiceDto {
  @IsUUID()
  pharmacyId: string;

  @IsUUID()
  vendorId: string;

  @IsUUID()
  invoiceTypeId: string;

  @IsString()
  @MaxLength(100)
  invoiceNumber: string;

  @IsOptional()
  @IsEnum(['INVOICE', 'STATEMENT', 'CREDIT_MEMO', 'OTHER'])
  documentType?: DocumentType;

  @IsDateString()
  invoiceDate: string;

  @IsDateString()
  dueDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
