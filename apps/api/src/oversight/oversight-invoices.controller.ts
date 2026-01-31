import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OversightService } from './oversight.service';
import {
  OversightInvoiceQueryDto,
  OverrideStatusDto,
  UnlockInvoiceDto,
  ReassignPharmacyDto,
} from './dto';

@Controller('v1/admin/oversight')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class OversightInvoicesController {
  constructor(private readonly oversightService: OversightService) {}

  @Get('invoices')
  async listInvoices(@Query() query: OversightInvoiceQueryDto) {
    return this.oversightService.getInvoices(query);
  }

  @Get('invoices/:id')
  async getInvoiceDetail(@Param('id') id: string) {
    return this.oversightService.getInvoiceDetail(id);
  }

  @Post('invoices/:id/override-status')
  async overrideStatus(
    @Param('id') id: string,
    @Body() dto: OverrideStatusDto,
    @Request() req: any,
  ) {
    return this.oversightService.overrideStatus(id, dto, req.user.id);
  }

  @Post('invoices/:id/unlock')
  async unlockInvoice(
    @Param('id') id: string,
    @Body() dto: UnlockInvoiceDto,
    @Request() req: any,
  ) {
    return this.oversightService.unlockInvoice(id, dto, req.user.id);
  }

  @Post('invoices/:id/reassign-pharmacy')
  async reassignPharmacy(
    @Param('id') id: string,
    @Body() dto: ReassignPharmacyDto,
    @Request() req: any,
  ) {
    return this.oversightService.reassignPharmacy(id, dto, req.user.id);
  }
}
