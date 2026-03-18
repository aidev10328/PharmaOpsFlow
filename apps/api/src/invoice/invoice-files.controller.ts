import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Response,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InvoiceFilesService } from './invoice-files.service';
import { LocalDiskStorageProvider } from '../storage/local.provider';
import * as fs from 'fs/promises';

@Controller()
export class InvoiceFilesController {
  constructor(
    private readonly invoiceFilesService: InvoiceFilesService,
    private readonly localStorageProvider: LocalDiskStorageProvider,
  ) {}

  /**
   * Upload a file for an invoice
   * POST /invoices/:invoiceId/files
   */
  @Post('invoices/:invoiceId/files')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadFile(
    @Param('invoiceId') invoiceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('autoExtract') autoExtract: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Check upload permission
    const canUpload = await this.invoiceFilesService.canUpload(
      invoiceId,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );

    if (!canUpload) {
      throw new ForbiddenException('You do not have permission to upload files to this invoice');
    }

    return this.invoiceFilesService.uploadFile({
      invoiceId,
      file,
      userId: req.user.id,
      autoExtract: autoExtract === 'true',
    });
  }

  /**
   * List files for an invoice
   * GET /invoices/:invoiceId/files
   */
  @Get('invoices/:invoiceId/files')
  @UseGuards(JwtAuthGuard)
  async listFiles(@Param('invoiceId') invoiceId: string, @Request() req) {
    const hasAccess = await this.invoiceFilesService.checkAccess(
      invoiceId,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    return this.invoiceFilesService.listFiles(invoiceId);
  }

  /**
   * Get download URL for a file
   * GET /invoice-files/:fileId/download
   */
  @Get('invoice-files/:fileId/download')
  @UseGuards(JwtAuthGuard)
  async getDownloadUrl(@Param('fileId') fileId: string, @Request() req) {
    const file = await this.invoiceFilesService.getFile(fileId);

    const hasAccess = await this.invoiceFilesService.checkAccess(
      file.invoiceId,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this file');
    }

    return this.invoiceFilesService.getDownloadUrl(fileId);
  }

  /**
   * Delete a file
   * DELETE /invoice-files/:fileId
   */
  @Delete('invoice-files/:fileId')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Param('fileId') fileId: string, @Request() req) {
    const file = await this.invoiceFilesService.getFile(fileId);

    const hasAccess = await this.invoiceFilesService.checkAccess(
      file.invoiceId,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this file');
    }

    return this.invoiceFilesService.deleteFile(fileId, req.user.id, req.user.role);
  }

  /**
   * Serve local files (only for local storage provider)
   * GET /invoice-files/local/:token
   * This route doesn't require auth - token contains expiry
   */
  @Get('invoice-files/local/:token')
  async serveLocalFile(
    @Param('token') token: string,
    @Response() res: ExpressResponse,
  ) {
    const { storagePath, valid } = this.localStorageProvider.verifyDownloadToken(token);

    if (!valid) {
      throw new ForbiddenException('Invalid or expired download link');
    }

    const fullPath = this.localStorageProvider.getFullPath(storagePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      throw new BadRequestException('File not found');
    }

    // Get filename from path
    const fileName = storagePath.split('/').pop() || 'download';
    // Remove UUID prefix if present
    const cleanName = fileName.replace(/^[a-f0-9-]+-/, '');

    // Set headers for download
    res.setHeader('Content-Disposition', `inline; filename="${cleanName}"`);

    // Stream the file
    res.sendFile(fullPath);
  }
}
