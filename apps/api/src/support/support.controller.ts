import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  UpdateTicketStatusDto,
  UpdateTicketDto,
  TicketQueryDto,
  AddCommentDto,
  AssignTicketDto,
} from './dto';

// ─── End-User Endpoints ──────────────────────────────────
@Controller('v1/support/tickets')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  async createTicket(@Body() dto: CreateTicketDto, @Request() req: any) {
    return this.supportService.createTicket(dto, req.user);
  }

  @Post('generate-report')
  async generateReport(@Body() dto: CreateTicketDto) {
    return this.supportService.generateStructuredReport(dto);
  }

  @Get('my')
  async getMyTickets(@Request() req: any) {
    return this.supportService.getMyTickets(req.user.id);
  }

  @Get(':id')
  async getTicketDetail(@Param('id') id: string, @Request() req: any) {
    return this.supportService.getTicketDetail(id, req.user);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('type') attachmentType: string,
    @Request() req: any,
  ) {
    return this.supportService.uploadAttachment(id, file, attachmentType, req.user);
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(@Param('attachmentId') attachmentId: string) {
    return this.supportService.getAttachmentUrl(attachmentId);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @Request() req: any,
  ) {
    return this.supportService.addComment(id, dto, req.user);
  }
}

// ─── Admin Endpoints ─────────────────────────────────────
@Controller('v1/admin/support/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SupportAdminController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  async listTickets(@Query() query: TicketQueryDto) {
    return this.supportService.listTickets(query);
  }

  @Get(':id')
  async getTicketDetail(@Param('id') id: string, @Request() req: any) {
    return this.supportService.getTicketDetail(id, req.user);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @Request() req: any,
  ) {
    return this.supportService.updateStatus(id, dto, req.user);
  }

  @Put(':id')
  async updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto);
  }

  @Post(':id/assign')
  async assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @Request() req: any,
  ) {
    return this.supportService.assignTicket(id, dto, req.user);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @Request() req: any,
  ) {
    return this.supportService.addComment(id, dto, req.user);
  }
}
