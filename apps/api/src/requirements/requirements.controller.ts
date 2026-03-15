import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { RequirementInstanceStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RequirementsService } from './requirements.service';
import {
  CreateRequirementDto,
  UpdateRequirementDto,
  RequirementFiltersDto,
  InstanceFiltersDto,
  LinkInvoiceDto,
  GenerateInstancesDto,
} from './dto/requirements.dto';

@Controller('v1/requirements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  // ========== INSTANCE MANAGEMENT ==========
  // NOTE: All specific routes must come BEFORE the :id routes to avoid route conflicts

  @Post('instances/generate')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async generateInstances(@Body() dto: GenerateInstancesDto, @Request() req: any) {
    return this.requirementsService.generateInstances(
      dto.startMonth,
      dto.endMonth,
      dto.pharmacyId,
      req.user.orgId,
    );
  }

  @Get('instances')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN)
  async listInstances(@Query() filters: InstanceFiltersDto, @Request() req: any) {
    return this.requirementsService.listInstances(filters, req.user.orgId);
  }

  @Get('instances/:id')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN, Role.PHARMACY_USER)
  async getInstance(@Param('id') id: string, @Request() req: any) {
    return this.requirementsService.getInstance(id, req.user.orgId);
  }

  @Post('instances/:id/link')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN, Role.PHARMACY_USER)
  async linkInvoice(
    @Param('id') id: string,
    @Body() dto: LinkInvoiceDto,
    @Request() req: any,
  ) {
    return this.requirementsService.linkInvoice(id, dto.invoiceId, req.user.orgId);
  }

  @Delete('instances/:id/link')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN)
  async unlinkInvoice(@Param('id') id: string, @Request() req: any) {
    return this.requirementsService.unlinkInvoice(id, req.user.orgId);
  }

  // ========== EVALUATION & COMPLIANCE ==========

  @Post('evaluate')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async evaluateInstances(
    @Query('yearMonth') yearMonth: string | undefined,
    @Request() req: any,
  ) {
    return this.requirementsService.evaluateInstances(req.user.orgId, yearMonth);
  }

  @Post('auto-link-invoices')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async autoLinkAllInvoices(@Request() req: any) {
    return this.requirementsService.autoLinkAllInvoices(req.user.orgId);
  }

  @Get('compliance/summary')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async getComplianceSummary(
    @Query('yearMonth') yearMonth: string | undefined,
    @Request() req: any,
  ) {
    return this.requirementsService.getComplianceSummary(req.user.orgId, yearMonth);
  }

  // ========== PHARMACY USER ENDPOINTS ==========

  @Get('pharmacy/:pharmacyId/instances')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN, Role.PHARMACY_USER)
  async getPharmacyInstances(
    @Param('pharmacyId') pharmacyId: string,
    @Query('yearMonth') yearMonth: string | undefined,
    @Query('status') status: RequirementInstanceStatus | undefined,
    @Request() req: any,
  ) {
    // Check pharmacy access for non-admin users
    if (req.user.role !== 'ADMIN') {
      const hasAccess = req.user.role === 'COMPANY_MANAGER'
        ? await this.requirementsService.verifyManagerAssignment(pharmacyId, req.user.id)
        : await this.requirementsService.verifyPharmacyAccess(pharmacyId, req.user.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this pharmacy');
      }
    }
    return this.requirementsService.getPharmacyInstances(pharmacyId, yearMonth, status);
  }

  @Get('pharmacy/:pharmacyId/summary')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN, Role.PHARMACY_USER)
  async getPharmacyRequirementsSummary(
    @Param('pharmacyId') pharmacyId: string,
    @Request() req: any,
  ) {
    // Check pharmacy access for non-admin users
    if (req.user.role !== 'ADMIN') {
      const hasAccess = req.user.role === 'COMPANY_MANAGER'
        ? await this.requirementsService.verifyManagerAssignment(pharmacyId, req.user.id)
        : await this.requirementsService.verifyPharmacyAccess(pharmacyId, req.user.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this pharmacy');
      }
    }
    return this.requirementsService.getPharmacyRequirementsSummary(pharmacyId);
  }

  // ========== REQUIREMENT CRUD ==========
  // NOTE: These :id routes must come LAST to avoid matching specific routes

  @Post()
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async createRequirement(@Body() dto: CreateRequirementDto, @Request() req: any) {
    return this.requirementsService.createRequirement(dto, req.user.orgId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN)
  async listRequirements(@Query() filters: RequirementFiltersDto, @Request() req: any) {
    return this.requirementsService.listRequirements(filters, req.user.orgId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER, Role.PHARMACY_ADMIN)
  async getRequirement(@Param('id') id: string, @Request() req: any) {
    return this.requirementsService.getRequirement(id, req.user.orgId);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async updateRequirement(
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto,
    @Request() req: any,
  ) {
    return this.requirementsService.updateRequirement(id, dto, req.user.orgId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async deleteRequirement(@Param('id') id: string, @Request() req: any) {
    await this.requirementsService.deleteRequirement(id, req.user.orgId);
    return { success: true };
  }
}
