import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.interface';
import {
  ISSUE_STRUCTURING_SERVICE,
  IIssueStructuringService,
} from './issue-structuring.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto, UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(ISSUE_STRUCTURING_SERVICE)
    private readonly structuringService: IIssueStructuringService,
  ) {}

  // ─── Ticket Number Generation ────────────────────────────
  private async generateTicketNumber(): Promise<string> {
    const last = await this.prisma.supportTicket.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });
    const lastNum = last ? parseInt(last.ticketNumber.replace('SUP-', ''), 10) : 0;
    return `SUP-${String(lastNum + 1).padStart(5, '0')}`;
  }

  // ─── Create Ticket ──────────────────────────────────────
  async createTicket(dto: CreateTicketDto, user: any) {
    const ticketNumber = await this.generateTicketNumber();

    const severity = (dto.severity as any) || this.mapImpactToSeverity(dto.businessImpact);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        portalKey: 'pharmaopsflow',
        tenantId: user.orgId || null,
        reportedByUserId: user.id,
        reportedByName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        reportedByEmail: user.email,
        issueType: dto.issueType as any,
        userTitle: dto.userTitle || null,
        userDescription: dto.userDescription,
        voiceTranscript: dto.voiceTranscript || null,
        structuredTitle: dto.structuredTitle || null,
        structuredSummary: dto.structuredSummary || null,
        stepsToReproduce: dto.stepsToReproduce || null,
        expectedResult: dto.expectedResult || null,
        actualResult: dto.actualResult || null,
        businessImpact: dto.businessImpact as any,
        severity: severity as any,
        category: dto.category || null,
        currentStatus: 'SUBMITTED',
        environment: dto.environment || null,
        pageUrl: dto.pageUrl || null,
        pageRoute: dto.pageRoute || null,
        pageTitle: dto.pageTitle || null,
        browserInfo: dto.browserInfo || null,
        viewportInfo: dto.viewportInfo || null,
        consoleErrors: dto.consoleErrors || null,
        failedApiRequests: dto.failedApiRequests || null,
        metadata: dto.metadata || null,
      },
      include: {
        attachments: true,
      },
    });

    // Create initial status history entry
    await this.prisma.supportTicketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        oldStatus: 'SUBMITTED',
        newStatus: 'SUBMITTED',
        changedByUserId: user.id,
        changedByName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        note: 'Ticket created',
      },
    });

    return ticket;
  }

  // ─── Upload Attachment ───────────────────────────────────
  async uploadAttachment(
    ticketId: string,
    file: Express.Multer.File,
    attachmentType: string,
    user: any,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const storagePath = `support/${ticketId}/${uuidv4()}-${file.originalname}`;

    await this.storage.uploadFile({
      file: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      storagePath,
    });

    return this.prisma.supportTicketAttachment.create({
      data: {
        ticketId,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        storagePath,
        attachmentType: (attachmentType as any) || 'OTHER',
      },
    });
  }

  // ─── Get Attachment Download URL ─────────────────────────
  async getAttachmentUrl(attachmentId: string) {
    const attachment = await this.prisma.supportTicketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const url = await this.storage.getSignedDownloadUrl(attachment.storagePath, 3600);
    return { url, fileName: attachment.fileName, fileType: attachment.fileType };
  }

  // ─── Get My Tickets ─────────────────────────────────────
  async getMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { reportedByUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        attachments: { select: { id: true, fileName: true, attachmentType: true } },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { assignedToName: true },
        },
      },
    });
  }

  // ─── Get Ticket Detail ──────────────────────────────────
  async getTicketDetail(ticketId: string, user: any) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        attachments: true,
        comments: {
          orderBy: { createdAt: 'asc' },
          where: user.role === 'ADMIN'
            ? {} // Admin sees all comments including internal
            : { isInternal: false }, // End users only see public comments
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    // Non-admin users can only see their own tickets
    if (user.role !== 'ADMIN' && ticket.reportedByUserId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return ticket;
  }

  // ─── Admin: List All Tickets ────────────────────────────
  async listTickets(query: TicketQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.currentStatus = query.status;
    }
    if (query.issueType) {
      where.issueType = query.issueType;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.reporterId) {
      where.reportedByUserId = query.reporterId;
    }
    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { userTitle: { contains: query.search, mode: 'insensitive' } },
        { structuredTitle: { contains: query.search, mode: 'insensitive' } },
        { userDescription: { contains: query.search, mode: 'insensitive' } },
        { reportedByName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    const sortField = query.sortBy || 'createdAt';
    orderBy[sortField] = query.sortDir || 'desc';

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          attachments: { select: { id: true, fileName: true, attachmentType: true } },
          assignments: {
            orderBy: { assignedAt: 'desc' },
            take: 1,
            select: { assignedToName: true, assignedToUserId: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { tickets, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Update Ticket Status ───────────────────────────────
  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto, user: any) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const oldStatus = ticket.currentStatus;

    const [updated] = await Promise.all([
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { currentStatus: dto.newStatus as any },
      }),
      this.prisma.supportTicketStatusHistory.create({
        data: {
          ticketId,
          oldStatus: oldStatus as any,
          newStatus: dto.newStatus as any,
          changedByUserId: user.id,
          changedByName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          note: dto.note || null,
        },
      }),
    ]);

    return updated;
  }

  // ─── Update Ticket Fields ───────────────────────────────
  async updateTicket(ticketId: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const data: any = {};
    if (dto.structuredTitle !== undefined) data.structuredTitle = dto.structuredTitle;
    if (dto.structuredSummary !== undefined) data.structuredSummary = dto.structuredSummary;
    if (dto.stepsToReproduce !== undefined) data.stepsToReproduce = dto.stepsToReproduce;
    if (dto.expectedResult !== undefined) data.expectedResult = dto.expectedResult;
    if (dto.actualResult !== undefined) data.actualResult = dto.actualResult;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.category !== undefined) data.category = dto.category;

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data,
    });
  }

  // ─── Add Comment ────────────────────────────────────────
  async addComment(ticketId: string, dto: AddCommentDto, user: any) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Non-admin users can only comment on their own tickets and can't add internal comments
    if (user.role !== 'ADMIN') {
      if (ticket.reportedByUserId !== user.id) {
        throw new ForbiddenException('Access denied');
      }
      dto.isInternal = false;
    }

    return this.prisma.supportTicketComment.create({
      data: {
        ticketId,
        authorUserId: user.id,
        authorName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        authorRole: user.role,
        isInternal: dto.isInternal || false,
        commentText: dto.commentText,
      },
    });
  }

  // ─── Assign Ticket ──────────────────────────────────────
  async assignTicket(ticketId: string, dto: AssignTicketDto, user: any) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignToUserId },
    });
    if (!assignee) throw new NotFoundException('Assignee user not found');

    return this.prisma.supportTicketAssignment.create({
      data: {
        ticketId,
        assignedToUserId: assignee.id,
        assignedToName: [assignee.firstName, assignee.lastName].filter(Boolean).join(' ') || assignee.email,
        assignedByUserId: user.id,
      },
    });
  }

  // ─── Generate Structured Report ─────────────────────────
  async generateStructuredReport(dto: CreateTicketDto) {
    return this.structuringService.generateReport({
      issueType: dto.issueType,
      businessImpact: dto.businessImpact,
      userTitle: dto.userTitle,
      userDescription: dto.userDescription,
      voiceTranscript: dto.voiceTranscript,
      pageUrl: dto.pageUrl,
      pageRoute: dto.pageRoute,
      pageTitle: dto.pageTitle,
      consoleErrors: dto.consoleErrors,
      failedApiRequests: dto.failedApiRequests,
    });
  }

  // ─── Helpers ────────────────────────────────────────────
  private mapImpactToSeverity(impact: string): string {
    const map: Record<string, string> = {
      BLOCKING: 'CRITICAL',
      MAJOR: 'HIGH',
      MINOR: 'MEDIUM',
      COSMETIC: 'LOW',
      SUGGESTION: 'INFO',
    };
    return map[impact] || 'MEDIUM';
  }
}
