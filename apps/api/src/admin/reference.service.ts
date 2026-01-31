import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  CreateInvoiceTypeDto,
  UpdateInvoiceTypeDto,
  CreateVendorDto,
  UpdateVendorDto,
  MergeVendorDto,
  CreateRequiredInvoiceDto,
} from './dto';

@Injectable()
export class ReferenceService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ===== Invoice Types =====

  async listInvoiceTypes() {
    return this.prisma.invoiceType.findMany({
      include: {
        _count: { select: { invoices: true, requiredInvoiceTypes: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createInvoiceType(dto: CreateInvoiceTypeDto, actorUserId: string) {
    let orgId = dto.orgId;
    if (!orgId) {
      const firstOrg = await this.prisma.org.findFirst();
      if (!firstOrg) throw new NotFoundException('Organization not found');
      orgId = firstOrg.id;
    }
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.prisma.invoiceType.findUnique({
      where: { orgId_code: { orgId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Invoice type code "${dto.code}" already exists`);

    const invoiceType = await this.prisma.invoiceType.create({
      data: {
        orgId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        isRequired: dto.isRequired ?? false,
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice_type.created',
      entityType: 'InvoiceType',
      entityId: invoiceType.id,
      after: invoiceType,
    });

    return invoiceType;
  }

  async updateInvoiceType(id: string, dto: UpdateInvoiceTypeDto, actorUserId: string) {
    const invoiceType = await this.prisma.invoiceType.findUnique({ where: { id } });
    if (!invoiceType) throw new NotFoundException('Invoice type not found');

    const before = { ...invoiceType };

    const updated = await this.prisma.invoiceType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice_type.updated',
      entityType: 'InvoiceType',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  async deactivateInvoiceType(id: string, actorUserId: string) {
    const invoiceType = await this.prisma.invoiceType.findUnique({ where: { id } });
    if (!invoiceType) throw new NotFoundException('Invoice type not found');
    if (!invoiceType.isActive) throw new BadRequestException('Invoice type is already inactive');

    // Check if used by active invoices
    const activeInvoiceCount = await this.prisma.invoice.count({
      where: {
        invoiceTypeId: id,
        status: { notIn: ['PAID', 'REJECTED'] },
      },
    });
    if (activeInvoiceCount > 0) {
      throw new BadRequestException(
        `Cannot deactivate: ${activeInvoiceCount} active invoice(s) use this type. Complete or reject them first.`,
      );
    }

    const updated = await this.prisma.invoiceType.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice_type.deactivated',
      entityType: 'InvoiceType',
      entityId: id,
      before: { isActive: true },
      after: { isActive: false },
    });

    return updated;
  }

  async reactivateInvoiceType(id: string, actorUserId: string) {
    const invoiceType = await this.prisma.invoiceType.findUnique({ where: { id } });
    if (!invoiceType) throw new NotFoundException('Invoice type not found');
    if (invoiceType.isActive) throw new BadRequestException('Invoice type is already active');

    const updated = await this.prisma.invoiceType.update({
      where: { id },
      data: { isActive: true },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice_type.reactivated',
      entityType: 'InvoiceType',
      entityId: id,
      before: { isActive: false },
      after: { isActive: true },
    });

    return updated;
  }

  // ===== Vendors =====

  async listVendors() {
    return this.prisma.vendor.findMany({
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createVendor(dto: CreateVendorDto, actorUserId: string) {
    let orgId = dto.orgId;
    if (!orgId) {
      const firstOrg = await this.prisma.org.findFirst();
      if (!firstOrg) throw new NotFoundException('Organization not found');
      orgId = firstOrg.id;
    }
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    if (dto.pharmacyId) {
      const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } });
      if (!pharmacy) throw new NotFoundException('Pharmacy not found');
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        orgId,
        pharmacyId: dto.pharmacyId ?? null,
        name: dto.name,
        externalRef: dto.externalRef,
        phone: dto.phone,
        email: dto.email,
        paymentTerms: dto.paymentTerms,
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'vendor.created',
      entityType: 'Vendor',
      entityId: vendor.id,
      after: vendor,
    });

    return vendor;
  }

  async updateVendor(id: string, dto: UpdateVendorDto, actorUserId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (dto.pharmacyId) {
      const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } });
      if (!pharmacy) throw new NotFoundException('Pharmacy not found');
    }

    const before = { ...vendor };

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.pharmacyId !== undefined && { pharmacyId: dto.pharmacyId || null }),
        ...(dto.externalRef !== undefined && { externalRef: dto.externalRef }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'vendor.updated',
      entityType: 'Vendor',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  async deactivateVendor(id: string, actorUserId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.isActive) throw new BadRequestException('Vendor is already inactive');

    const activeInvoiceCount = await this.prisma.invoice.count({
      where: {
        vendorId: id,
        status: { notIn: ['PAID', 'REJECTED'] },
      },
    });
    if (activeInvoiceCount > 0) {
      throw new BadRequestException(
        `Cannot deactivate: ${activeInvoiceCount} active invoice(s) reference this vendor. Complete or reject them first.`,
      );
    }

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'vendor.deactivated',
      entityType: 'Vendor',
      entityId: id,
      before: { isActive: true },
      after: { isActive: false },
    });

    return updated;
  }

  async reactivateVendor(id: string, actorUserId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.isActive) throw new BadRequestException('Vendor is already active');

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { isActive: true },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'vendor.reactivated',
      entityType: 'Vendor',
      entityId: id,
      before: { isActive: false },
      after: { isActive: true },
    });

    return updated;
  }

  async mergeVendor(sourceId: string, dto: MergeVendorDto, actorUserId: string) {
    const source = await this.prisma.vendor.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Source vendor not found');

    const target = await this.prisma.vendor.findUnique({ where: { id: dto.targetVendorId } });
    if (!target) throw new NotFoundException('Target vendor not found');

    if (sourceId === dto.targetVendorId) {
      throw new BadRequestException('Cannot merge a vendor into itself');
    }

    // Reassign all invoices from source to target
    const reassigned = await this.prisma.invoice.updateMany({
      where: { vendorId: sourceId },
      data: { vendorId: dto.targetVendorId },
    });

    // Deactivate source vendor
    await this.prisma.vendor.update({
      where: { id: sourceId },
      data: { isActive: false },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'vendor.merged',
      entityType: 'Vendor',
      entityId: sourceId,
      before: { sourceId, targetId: dto.targetVendorId },
      after: { invoicesReassigned: reassigned.count, sourceDeactivated: true },
    });

    return {
      sourceId,
      targetId: dto.targetVendorId,
      invoicesReassigned: reassigned.count,
    };
  }

  // ===== Required Invoice Types =====

  async listRequiredInvoices() {
    return this.prisma.requiredInvoiceType.findMany({
      include: {
        invoiceType: { select: { id: true, name: true, code: true, isActive: true } },
        pharmacy: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequiredInvoice(dto: CreateRequiredInvoiceDto, actorUserId: string) {
    let orgId = dto.orgId;
    if (!orgId) {
      const firstOrg = await this.prisma.org.findFirst();
      if (!firstOrg) throw new NotFoundException('Organization not found');
      orgId = firstOrg.id;
    }
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const invoiceType = await this.prisma.invoiceType.findUnique({ where: { id: dto.invoiceTypeId } });
    if (!invoiceType) throw new NotFoundException('Invoice type not found');
    if (!invoiceType.isActive) throw new BadRequestException('Cannot assign inactive invoice type as required');

    if (dto.pharmacyId) {
      const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } });
      if (!pharmacy) throw new NotFoundException('Pharmacy not found');
    }

    // Check for existing assignment
    const existing = await this.prisma.requiredInvoiceType.findFirst({
      where: {
        orgId,
        pharmacyId: dto.pharmacyId ?? null,
        invoiceTypeId: dto.invoiceTypeId,
      },
    });
    if (existing) throw new ConflictException('This required invoice assignment already exists');

    const required = await this.prisma.requiredInvoiceType.create({
      data: {
        orgId,
        pharmacyId: dto.pharmacyId ?? null,
        invoiceTypeId: dto.invoiceTypeId,
      },
      include: {
        invoiceType: { select: { id: true, name: true, code: true } },
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'required_invoice.created',
      entityType: 'RequiredInvoiceType',
      entityId: required.id,
      after: required,
    });

    return required;
  }

  async deleteRequiredInvoice(id: string, actorUserId: string) {
    const required = await this.prisma.requiredInvoiceType.findUnique({
      where: { id },
      include: {
        invoiceType: { select: { id: true, name: true, code: true } },
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });
    if (!required) throw new NotFoundException('Required invoice assignment not found');

    await this.prisma.requiredInvoiceType.delete({ where: { id } });

    await this.auditLog.log({
      actorUserId,
      action: 'required_invoice.deleted',
      entityType: 'RequiredInvoiceType',
      entityId: id,
      before: required,
    });

    return { success: true };
  }
}
