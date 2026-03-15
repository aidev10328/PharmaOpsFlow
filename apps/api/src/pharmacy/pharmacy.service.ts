import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role, MemberRole } from '../common/enums/role.enum';

@Injectable()
export class PharmacyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all pharmacies the user has access to
   */
  async getAccessiblePharmacies(userId: string, userRole: Role, userOrgId?: string) {
    // ADMIN can see all pharmacies
    if (userRole === Role.ADMIN) {
      return this.prisma.pharmacy.findMany({
        include: {
          org: { select: { id: true, name: true } },
          members: { select: { user: { select: { email: true } } } },
          _count: { select: { members: true } },
        },
        orderBy: { name: 'asc' },
      });
    }

    // COMPANY_MANAGER can see only assigned pharmacies in their org
    if (userRole === Role.COMPANY_MANAGER && userOrgId) {
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId },
        select: { pharmacyId: true },
      });
      const assignedIds = assignments.map((a) => a.pharmacyId);
      return this.prisma.pharmacy.findMany({
        where: { id: { in: assignedIds }, orgId: userOrgId },
        include: {
          org: { select: { id: true, name: true } },
          members: { select: { user: { select: { email: true } } } },
          _count: { select: { members: true } },
        },
        orderBy: { name: 'asc' },
      });
    }

    // PHARMACY_ADMIN, PHARMACY_USER, READ_ONLY can only see pharmacies they are members of
    return this.prisma.pharmacy.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        org: { select: { id: true, name: true } },
        members: {
          select: { memberRole: true, user: { select: { email: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get a single pharmacy by ID
   */
  async getPharmacyById(pharmacyId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: {
        org: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
  }

  /**
   * Check if a user has access to a pharmacy
   */
  async checkPharmacyAccess(
    userId: string,
    userRole: Role,
    userOrgId: string | null,
    pharmacyId: string,
  ): Promise<{ hasAccess: boolean; memberRole?: MemberRole }> {
    // ADMIN has access to everything
    if (userRole === Role.ADMIN) {
      return { hasAccess: true };
    }

    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { orgId: true },
    });

    if (!pharmacy) {
      return { hasAccess: false };
    }

    // COMPANY_MANAGER has access to assigned pharmacies in their org
    if (userRole === Role.COMPANY_MANAGER && userOrgId === pharmacy.orgId) {
      const assignment = await this.prisma.managerPharmacy.findUnique({
        where: { userId_pharmacyId: { userId, pharmacyId } },
      });
      return { hasAccess: !!assignment };
    }

    // Check membership for other roles
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: { userId, pharmacyId },
      },
    });

    if (membership) {
      return {
        hasAccess: true,
        memberRole: membership.memberRole as MemberRole,
      };
    }

    return { hasAccess: false };
  }

  /**
   * Get user's pharmacy memberships
   */
  async getUserMemberships(userId: string) {
    return this.prisma.pharmacyMember.findMany({
      where: { userId },
      include: {
        pharmacy: {
          include: {
            org: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Get all members of a pharmacy
   */
  async getPharmacyMembers(pharmacyId: string) {
    return this.prisma.pharmacyMember.findMany({
      where: { pharmacyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }

  /**
   * Add a member to a pharmacy
   */
  async addPharmacyMember(
    pharmacyId: string,
    userId: string,
    memberRole: MemberRole,
  ) {
    return this.prisma.pharmacyMember.create({
      data: {
        pharmacyId,
        userId,
        memberRole,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        pharmacy: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  /**
   * Remove a member from a pharmacy
   */
  async removePharmacyMember(pharmacyId: string, userId: string) {
    return this.prisma.pharmacyMember.delete({
      where: {
        userId_pharmacyId: { userId, pharmacyId },
      },
    });
  }

  /**
   * Update a member's role in a pharmacy
   */
  async updateMemberRole(
    pharmacyId: string,
    userId: string,
    memberRole: MemberRole,
  ) {
    return this.prisma.pharmacyMember.update({
      where: {
        userId_pharmacyId: { userId, pharmacyId },
      },
      data: { memberRole },
    });
  }

  /**
   * Check if a user is a member of a pharmacy (simple boolean check)
   * Used by PharmacyScopeGuard for quick membership validation
   */
  async isMember(userId: string, pharmacyId: string): Promise<boolean> {
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: { userId, pharmacyId },
      },
      select: { id: true },
    });
    return membership !== null;
  }
}
