import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from './audit-log.service';
import { Role } from '../common/enums/role.enum';
import {
  UpdateOrgDto,
  CreatePharmacyDto,
  UpdatePharmacyDto,
  CreateUserDto,
  UpdateUserDto,
  AddMemberDto,
} from './dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ===== Organization Management =====

  async getOrg(orgId: string | null) {
    const org = orgId
      ? await this.prisma.org.findUnique({ where: { id: orgId } })
      : await this.prisma.org.findFirst();

    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrg(orgId: string | null, dto: UpdateOrgDto, actorUserId: string) {
    const org = await this.getOrg(orgId);
    const before = { ...org };

    const updated = await this.prisma.org.update({
      where: { id: org.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'org.updated',
      entityType: 'Org',
      entityId: updated.id,
      before,
      after: updated,
    });

    return updated;
  }

  // ===== Pharmacy Management =====

  async listPharmacies(user?: { id?: string; role: string; orgId?: string }) {
    let where: any = {};

    if (user?.role === 'COMPANY_MANAGER' && user.orgId) {
      // Get only pharmacies assigned to this manager
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId: user.id },
        select: { pharmacyId: true },
      });
      const assignedIds = assignments.map((a) => a.pharmacyId);

      if (assignedIds.length > 0) {
        where = { id: { in: assignedIds }, orgId: user.orgId };
      } else {
        // No assignments = no pharmacies visible
        where = { id: 'none' };
      }
    }

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        org: { select: { id: true, name: true } },
        _count: { select: { members: true, invoices: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createPharmacy(dto: CreatePharmacyDto, actorUserId: string) {
    const org = await this.prisma.org.findUnique({ where: { id: dto.orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.prisma.pharmacy.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Pharmacy code "${dto.code}" already exists`);

    const pharmacy = await this.prisma.pharmacy.create({
      data: {
        orgId: dto.orgId,
        name: dto.name,
        code: dto.code,
        street: dto.street,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        phone: dto.phone,
        website: dto.website,
        timezone: dto.timezone ?? 'America/New_York',
        ...(dto.submissionDueDay !== undefined && { submissionDueDay: dto.submissionDueDay }),
        ...(dto.processingDueDay !== undefined && { processingDueDay: dto.processingDueDay }),
      },
      include: {
        org: { select: { id: true, name: true } },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy.created',
      entityType: 'Pharmacy',
      entityId: pharmacy.id,
      after: pharmacy,
    });

    return pharmacy;
  }

  async updatePharmacy(pharmacyId: string, dto: UpdatePharmacyDto, actorUserId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    const before = { ...pharmacy };

    const updated = await this.prisma.pharmacy.update({
      where: { id: pharmacyId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.submissionDueDay !== undefined && { submissionDueDay: dto.submissionDueDay }),
        ...(dto.processingDueDay !== undefined && { processingDueDay: dto.processingDueDay }),
      },
      include: {
        org: { select: { id: true, name: true } },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy.updated',
      entityType: 'Pharmacy',
      entityId: pharmacyId,
      before,
      after: updated,
    });

    return updated;
  }

  async deactivatePharmacy(pharmacyId: string, actorUserId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');
    if (!pharmacy.isActive) throw new BadRequestException('Pharmacy is already inactive');

    const updated = await this.prisma.pharmacy.update({
      where: { id: pharmacyId },
      data: { isActive: false },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy.deactivated',
      entityType: 'Pharmacy',
      entityId: pharmacyId,
      before: { isActive: true },
      after: { isActive: false },
    });

    return updated;
  }

  async reactivatePharmacy(pharmacyId: string, actorUserId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');
    if (pharmacy.isActive) throw new BadRequestException('Pharmacy is already active');

    const updated = await this.prisma.pharmacy.update({
      where: { id: pharmacyId },
      data: { isActive: true },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy.reactivated',
      entityType: 'Pharmacy',
      entityId: pharmacyId,
      before: { isActive: false },
      after: { isActive: true },
    });

    return updated;
  }

  // ===== User Management =====

  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        orgId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        org: { select: { id: true, name: true } },
        _count: { select: { pharmacyMemberships: true, managedPharmacies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserDto, actorUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    if (dto.role === Role.COMPANY_MANAGER && !dto.orgId) {
      throw new BadRequestException('COMPANY_MANAGER must be assigned to an organization');
    }

    if (dto.orgId) {
      const org = await this.prisma.org.findUnique({ where: { id: dto.orgId } });
      if (!org) throw new NotFoundException('Organization not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        orgId: dto.orgId ?? null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        orgId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'user.created',
      entityType: 'User',
      entityId: user.id,
      after: user,
    });

    return user;
  }

  async updateUser(userId: string, dto: UpdateUserDto, actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const before = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      orgId: user.orgId,
    };

    // ADMIN cannot downgrade own role
    if (userId === actorUserId && dto.role && dto.role !== Role.ADMIN) {
      throw new ForbiddenException('Cannot downgrade your own admin role');
    }

    // If changing to COMPANY_MANAGER, remove pharmacy memberships
    if (dto.role === Role.COMPANY_MANAGER) {
      await this.prisma.pharmacyMember.deleteMany({ where: { userId } });
    }

    // If email is changing, check uniqueness
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already registered');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.orgId !== undefined && { orgId: dto.orgId }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        orgId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'user.updated',
      entityType: 'User',
      entityId: userId,
      before,
      after: updated,
    });

    return updated;
  }

  async resetPassword(userId: string, actorUserId: string, newPassword?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const tempPassword = newPassword || crypto.randomBytes(6).toString('base64url');
    if (tempPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'user.password_reset',
      entityType: 'User',
      entityId: userId,
    });

    return { tempPassword };
  }

  async disableUser(userId: string, actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (userId === actorUserId) {
      throw new ForbiddenException('Cannot disable your own account');
    }

    if (!user.isActive) throw new BadRequestException('User is already disabled');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'user.disabled',
      entityType: 'User',
      entityId: userId,
    });

    return { success: true };
  }

  async enableUser(userId: string, actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.isActive) throw new BadRequestException('User is already active');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'user.enabled',
      entityType: 'User',
      entityId: userId,
    });

    return { success: true };
  }

  // ===== Pharmacy Membership Management =====

  async listMembers(pharmacyId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    return this.prisma.pharmacyMember.findMany({
      where: { pharmacyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMember(pharmacyId: string, dto: AddMemberDto, actorUserId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    // Only PHARMACY_ADMIN, PHARMACY_USER, READ_ONLY can be members
    const allowedRoles: string[] = [Role.PHARMACY_ADMIN, Role.PHARMACY_USER, Role.READ_ONLY];
    if (!allowedRoles.includes(user.role)) {
      throw new BadRequestException(
        `Users with role ${user.role} cannot be pharmacy members. Only PHARMACY_ADMIN, PHARMACY_USER, and READ_ONLY roles are allowed.`,
      );
    }

    // Check for existing membership
    const existing = await this.prisma.pharmacyMember.findUnique({
      where: { userId_pharmacyId: { userId: dto.userId, pharmacyId } },
    });
    if (existing) throw new ConflictException('User is already a member of this pharmacy');

    const member = await this.prisma.pharmacyMember.create({
      data: {
        userId: dto.userId,
        pharmacyId,
        memberRole: dto.memberRole,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy_member.added',
      entityType: 'PharmacyMember',
      entityId: member.id,
      after: { userId: dto.userId, pharmacyId, memberRole: dto.memberRole },
    });

    return member;
  }

  async removeMember(pharmacyId: string, memberId: string, actorUserId: string) {
    const member = await this.prisma.pharmacyMember.findFirst({
      where: { id: memberId, pharmacyId },
    });
    if (!member) throw new NotFoundException('Membership not found');

    await this.prisma.pharmacyMember.delete({ where: { id: memberId } });

    await this.auditLog.log({
      actorUserId,
      action: 'pharmacy_member.removed',
      entityType: 'PharmacyMember',
      entityId: memberId,
      before: { userId: member.userId, pharmacyId, memberRole: member.memberRole },
    });

    return { success: true };
  }

  // ===== Manager Pharmacy Assignments =====

  async getManagerPharmacies(managerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.COMPANY_MANAGER) {
      throw new BadRequestException('User is not a COMPANY_MANAGER');
    }

    return this.prisma.managerPharmacy.findMany({
      where: { userId: managerId },
      include: {
        pharmacy: {
          select: { id: true, name: true, code: true, city: true, state: true, isActive: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignPharmacyToManager(
    managerId: string,
    pharmacyId: string,
    actorUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.COMPANY_MANAGER) {
      throw new BadRequestException('User is not a COMPANY_MANAGER');
    }

    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    // Ensure same org
    if (user.orgId !== pharmacy.orgId) {
      throw new BadRequestException('User and pharmacy must belong to the same organization');
    }

    // Check existing
    const existing = await this.prisma.managerPharmacy.findUnique({
      where: { userId_pharmacyId: { userId: managerId, pharmacyId } },
    });
    if (existing) throw new ConflictException('Pharmacy already assigned to this manager');

    const assignment = await this.prisma.managerPharmacy.create({
      data: { userId: managerId, pharmacyId },
      include: {
        pharmacy: {
          select: { id: true, name: true, code: true, city: true, state: true, isActive: true },
        },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'manager_pharmacy.assigned',
      entityType: 'ManagerPharmacy',
      entityId: assignment.id,
      after: { userId: managerId, pharmacyId },
    });

    return assignment;
  }

  async unassignPharmacyFromManager(
    managerId: string,
    pharmacyId: string,
    actorUserId: string,
  ) {
    const assignment = await this.prisma.managerPharmacy.findUnique({
      where: { userId_pharmacyId: { userId: managerId, pharmacyId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.prisma.managerPharmacy.delete({ where: { id: assignment.id } });

    await this.auditLog.log({
      actorUserId,
      action: 'manager_pharmacy.unassigned',
      entityType: 'ManagerPharmacy',
      entityId: assignment.id,
      before: { userId: managerId, pharmacyId },
    });

    return { success: true };
  }
}
