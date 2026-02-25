import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ReferenceService } from './reference.service';
import {
  CreateInvoiceTypeDto,
  UpdateInvoiceTypeDto,
  CreateVendorDto,
  UpdateVendorDto,
  MergeVendorDto,
  CreateRequiredInvoiceDto,
} from './dto';

@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  // ===== Invoice Types =====

  @Get('invoice-types')
  async listInvoiceTypes() {
    return this.referenceService.listInvoiceTypes();
  }

  @Post('invoice-types')
  async createInvoiceType(@Body() dto: CreateInvoiceTypeDto, @Request() req: any) {
    if (!dto.orgId) {
      dto.orgId = req.user.orgId || req.user.org?.id;
    }
    return this.referenceService.createInvoiceType(dto, req.user.id);
  }

  @Patch('invoice-types/:id')
  async updateInvoiceType(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceTypeDto,
    @Request() req: any,
  ) {
    return this.referenceService.updateInvoiceType(id, dto, req.user.id);
  }

  @Post('invoice-types/:id/deactivate')
  async deactivateInvoiceType(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.deactivateInvoiceType(id, req.user.id);
  }

  @Post('invoice-types/:id/reactivate')
  async reactivateInvoiceType(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.reactivateInvoiceType(id, req.user.id);
  }

  // ===== Vendors =====

  @Get('vendors')
  async listVendors() {
    return this.referenceService.listVendors();
  }

  @Post('vendors')
  async createVendor(@Body() dto: CreateVendorDto, @Request() req: any) {
    if (!dto.orgId) {
      dto.orgId = req.user.orgId || req.user.org?.id;
    }
    return this.referenceService.createVendor(dto, req.user.id);
  }

  @Patch('vendors/:id')
  async updateVendor(
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
    @Request() req: any,
  ) {
    return this.referenceService.updateVendor(id, dto, req.user.id);
  }

  @Post('vendors/:id/deactivate')
  async deactivateVendor(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.deactivateVendor(id, req.user.id);
  }

  @Post('vendors/:id/reactivate')
  async reactivateVendor(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.reactivateVendor(id, req.user.id);
  }

  @Post('vendors/:id/merge')
  async mergeVendor(
    @Param('id') id: string,
    @Body() dto: MergeVendorDto,
    @Request() req: any,
  ) {
    return this.referenceService.mergeVendor(id, dto, req.user.id);
  }

  // ===== Required Invoice Types =====

  @Get('required-invoices')
  async listRequiredInvoices() {
    return this.referenceService.listRequiredInvoices();
  }

  @Post('required-invoices')
  async createRequiredInvoice(@Body() dto: CreateRequiredInvoiceDto, @Request() req: any) {
    if (!dto.orgId) {
      dto.orgId = req.user.orgId || req.user.org?.id;
    }
    return this.referenceService.createRequiredInvoice(dto, req.user.id);
  }

  @Delete('required-invoices/:id')
  async deleteRequiredInvoice(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.deleteRequiredInvoice(id, req.user.id);
  }
}
