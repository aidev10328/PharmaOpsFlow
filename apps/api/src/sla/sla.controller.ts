import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SlaService } from './sla.service';
import { PrismaService } from '../prisma.service';

@Controller('v1/sla')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(
    private readonly slaService: SlaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Run SLA evaluation (admin/manager only or via n8n webhook)
   * POST /v1/sla/run
   */
  @Post('run')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async runEvaluation(@Query('yearMonth') yearMonth?: string) {
    const result = await this.slaService.runEvaluation(yearMonth);
    return {
      success: true,
      ...result,
    };
  }

  /**
   * Send reminders (admin/manager only or via n8n webhook)
   * POST /v1/sla/reminders/:type
   */
  @Post('reminders/:type')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async sendReminders(@Param('type') type: 'submission' | 'processing') {
    if (type !== 'submission' && type !== 'processing') {
      throw new ForbiddenException('Invalid reminder type');
    }
    const count = await this.slaService.sendReminders(type);
    return {
      success: true,
      type,
      remindersSent: count,
    };
  }

  /**
   * Get SLA summary for managers
   * GET /v1/sla/summary
   */
  @Get('summary')
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async getSummary(@Request() req, @Query('yearMonth') yearMonth?: string) {
    // For admin users without orgId, get the first org
    let orgId = req.user.orgId;
    if (!orgId && req.user.role === 'ADMIN') {
      const firstOrg = await this.prisma.org.findFirst();
      orgId = firstOrg?.id;
    }
    if (!orgId) {
      throw new ForbiddenException('User must belong to an organization');
    }

    // For COMPANY_MANAGER, scope to assigned pharmacies
    let assignedPharmacyIds: string[] | undefined;
    if (req.user.role === 'COMPANY_MANAGER') {
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId: req.user.id },
        select: { pharmacyId: true },
      });
      assignedPharmacyIds = assignments.map((a) => a.pharmacyId);
    }

    return this.slaService.getSummary(orgId, yearMonth, assignedPharmacyIds);
  }

  /**
   * Get SLA status for a specific pharmacy
   * GET /v1/sla/pharmacies/:pharmacyId
   */
  @Get('pharmacies/:pharmacyId')
  async getPharmacyStatus(
    @Param('pharmacyId') pharmacyId: string,
    @Query('yearMonth') yearMonth: string,
    @Request() req,
  ) {
    // Check access
    const canAccess = await this.checkPharmacyAccess(pharmacyId, req.user);
    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    return this.slaService.getPharmacyStatus(pharmacyId, yearMonth);
  }

  /**
   * Get SLA alerts for a pharmacy (for dashboard widget)
   * GET /v1/sla/pharmacies/:pharmacyId/alerts
   */
  @Get('pharmacies/:pharmacyId/alerts')
  async getPharmacyAlerts(
    @Param('pharmacyId') pharmacyId: string,
    @Query('limit') limit: string,
    @Request() req,
  ) {
    // Check access
    const canAccess = await this.checkPharmacyAccess(pharmacyId, req.user);
    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    return this.slaService.getPharmacyAlerts(pharmacyId, parseInt(limit || '5', 10));
  }

  /**
   * Check if user has access to pharmacy
   */
  private async checkPharmacyAccess(pharmacyId: string, user: any): Promise<boolean> {
    // Admin has full access
    if (user.role === 'ADMIN') {
      return true;
    }

    // Get pharmacy
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { orgId: true },
    });

    if (!pharmacy) {
      return false;
    }

    // Company manager can access assigned pharmacies in their org
    if (user.role === 'COMPANY_MANAGER' && user.orgId === pharmacy.orgId) {
      const assignment = await this.prisma.managerPharmacy.findUnique({
        where: { userId_pharmacyId: { userId: user.id, pharmacyId } },
      });
      return !!assignment;
    }

    // Pharmacy users check membership
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: { userId: user.id, pharmacyId },
      },
    });

    return !!membership;
  }
}
