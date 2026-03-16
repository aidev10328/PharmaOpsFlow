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
import { NotificationPreferenceService } from './notification-preference.service';
import {
  CreateInvoiceTypeDto,
  UpdateInvoiceTypeDto,
  CreateVendorDto,
  UpdateVendorDto,
  MergeVendorDto,
  CreateRequiredInvoiceDto,
  CreateFrequencyDto,
  UpdateFrequencyDto,
  CreateInvoiceCategoryDto,
  UpdateInvoiceCategoryDto,
  UpdateNotificationPreferenceDto,
} from './dto';
import { NotificationType } from '@prisma/client';

@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
export class ReferenceController {
  constructor(
    private readonly referenceService: ReferenceService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
  ) {}

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

  // ===== Frequencies =====

  @Get('frequencies')
  async listFrequencies() {
    return this.referenceService.listFrequencies();
  }

  @Post('frequencies')
  async createFrequency(@Body() dto: CreateFrequencyDto, @Request() req: any) {
    if (!dto.orgId) {
      dto.orgId = req.user.orgId || req.user.org?.id;
    }
    return this.referenceService.createFrequency(dto, req.user.id);
  }

  @Patch('frequencies/:id')
  async updateFrequency(
    @Param('id') id: string,
    @Body() dto: UpdateFrequencyDto,
    @Request() req: any,
  ) {
    return this.referenceService.updateFrequency(id, dto, req.user.id);
  }

  @Post('frequencies/:id/deactivate')
  async deactivateFrequency(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.deactivateFrequency(id, req.user.id);
  }

  @Post('frequencies/:id/reactivate')
  async reactivateFrequency(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.reactivateFrequency(id, req.user.id);
  }

  // ===== Invoice Categories =====

  @Get('invoice-categories')
  async listInvoiceCategories() {
    return this.referenceService.listInvoiceCategories();
  }

  @Post('invoice-categories')
  async createInvoiceCategory(@Body() dto: CreateInvoiceCategoryDto, @Request() req: any) {
    if (!dto.orgId) {
      dto.orgId = req.user.orgId || req.user.org?.id;
    }
    return this.referenceService.createInvoiceCategory(dto, req.user.id);
  }

  @Patch('invoice-categories/:id')
  async updateInvoiceCategory(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceCategoryDto,
    @Request() req: any,
  ) {
    return this.referenceService.updateInvoiceCategory(id, dto, req.user.id);
  }

  @Post('invoice-categories/:id/deactivate')
  async deactivateInvoiceCategory(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.deactivateInvoiceCategory(id, req.user.id);
  }

  @Post('invoice-categories/:id/reactivate')
  async reactivateInvoiceCategory(@Param('id') id: string, @Request() req: any) {
    return this.referenceService.reactivateInvoiceCategory(id, req.user.id);
  }

  // ===== Notification Preferences =====

  @Get('notification-preferences')
  async listNotificationPreferences(@Request() req: any) {
    const orgId = req.user.orgId || req.user.org?.id;
    return this.notificationPreferenceService.getPreferences(orgId);
  }

  @Patch('notification-preferences/:notificationType')
  async updateNotificationPreference(
    @Param('notificationType') notificationType: NotificationType,
    @Body() dto: UpdateNotificationPreferenceDto,
    @Request() req: any,
  ) {
    const orgId = req.user.orgId || req.user.org?.id;
    return this.notificationPreferenceService.updatePreference(orgId, notificationType, dto);
  }
}
