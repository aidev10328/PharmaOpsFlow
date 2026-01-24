import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PharmacyScopeGuard } from '../common/guards/pharmacy-scope.guard';
import { PharmacyScope } from '../common/decorators/pharmacy-scope.decorator';
import { MemberRole } from '../common/enums/role.enum';

@Controller('pharmacies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PharmacyController {
  constructor(private pharmacyService: PharmacyService) {}

  /**
   * Get all pharmacies accessible to the current user
   */
  @Get()
  async getMyPharmacies(@Request() req: any) {
    const { id, role, orgId } = req.user;
    return this.pharmacyService.getAccessiblePharmacies(id, role, orgId);
  }

  /**
   * Get a specific pharmacy by ID
   * User must be ADMIN, COMPANY_MANAGER of same org, or a member of the pharmacy
   */
  @Get(':pharmacyId')
  @UseGuards(PharmacyScopeGuard)
  @PharmacyScope({
    paramName: 'pharmacyId',
    allowedMemberRoles: [
      MemberRole.PHARMACY_ADMIN,
      MemberRole.PHARMACY_USER,
      MemberRole.READ_ONLY,
    ],
  })
  async getPharmacy(@Param('pharmacyId') pharmacyId: string) {
    return this.pharmacyService.getPharmacyById(pharmacyId);
  }

  /**
   * Get members of a pharmacy
   * Only PHARMACY_ADMIN (or higher) can view members
   */
  @Get(':pharmacyId/members')
  @UseGuards(PharmacyScopeGuard)
  @PharmacyScope({
    paramName: 'pharmacyId',
    allowedMemberRoles: [MemberRole.PHARMACY_ADMIN],
  })
  async getPharmacyMembers(@Param('pharmacyId') pharmacyId: string) {
    return this.pharmacyService.getPharmacyMembers(pharmacyId);
  }

  /**
   * Get current user's memberships
   */
  @Get('my/memberships')
  async getMyMemberships(@Request() req: any) {
    return this.pharmacyService.getUserMemberships(req.user.id);
  }
}
