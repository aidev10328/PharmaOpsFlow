import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { Role, MemberRole } from '../enums/role.enum';
import {
  PHARMACY_SCOPE_KEY,
  PharmacyScopeOptions,
} from '../decorators/pharmacy-scope.decorator';

@Injectable()
export class PharmacyScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PharmacyScopeOptions>(
      PHARMACY_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no pharmacy scope is defined, allow access
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // ADMIN has access to everything
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Get pharmacyId from route params (default to 'pharmacyId')
    const paramName = options.paramName ?? 'pharmacyId';
    const pharmacyId = request.params[paramName];

    if (!pharmacyId) {
      throw new ForbiddenException('Pharmacy ID is required');
    }

    // Fetch the pharmacy to check it exists and get its org
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, orgId: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // COMPANY_MANAGER can access only assigned pharmacies in their org
    if (options.allowOrgManagers && user.role === Role.COMPANY_MANAGER) {
      if (user.orgId !== pharmacy.orgId) {
        throw new ForbiddenException(
          'You do not have access to pharmacies outside your organization',
        );
      }
      // Check manager-pharmacy assignment
      const assignment = await this.prisma.managerPharmacy.findUnique({
        where: {
          userId_pharmacyId: { userId: user.id, pharmacyId },
        },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'You are not assigned to manage this pharmacy',
        );
      }
      request.pharmacy = pharmacy;
      return true;
    }

    // Check pharmacy membership for PHARMACY_ADMIN, PHARMACY_USER, READ_ONLY
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: {
          userId: user.id,
          pharmacyId: pharmacyId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this pharmacy',
      );
    }

    // Check if user has the required member role
    const allowedRoles = options.allowedMemberRoles ?? [
      MemberRole.PHARMACY_ADMIN,
      MemberRole.PHARMACY_USER,
      MemberRole.READ_ONLY,
    ];
    const hasRequiredRole = allowedRoles.includes(
      membership.memberRole as MemberRole,
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Access denied. Required pharmacy roles: ${allowedRoles.join(', ')}`,
      );
    }

    // Attach pharmacy and membership to request for later use
    request.pharmacy = pharmacy;
    request.pharmacyMembership = membership;

    return true;
  }
}
