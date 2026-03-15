import {
  Controller,
  Get,
  Post,
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
  OversightSlaEventsQueryDto,
  OversightSlaSummaryQueryDto,
  OversightNotificationQueryDto,
} from './dto';

@Controller('v1/admin/oversight')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
export class OversightOpsController {
  constructor(private readonly oversightService: OversightService) {}

  @Get('sla/events')
  async getSlaEvents(@Query() query: OversightSlaEventsQueryDto, @Request() req: any) {
    return this.oversightService.getSlaEvents(query, req.user);
  }

  @Get('sla/summary')
  async getSlaSummary(@Query() query: OversightSlaSummaryQueryDto, @Request() req: any) {
    return this.oversightService.getSlaSummary(query.month, req.user);
  }

  @Get('automation')
  async getAutomationStats() {
    return this.oversightService.getAutomationStats();
  }

  @Post('automation/retry/:extractionId')
  async retryExtraction(
    @Param('extractionId') extractionId: string,
    @Request() req: any,
  ) {
    return this.oversightService.retryExtraction(extractionId, req.user.id);
  }

  @Get('notifications')
  async getNotifications(@Query() query: OversightNotificationQueryDto) {
    return this.oversightService.getNotifications(query);
  }
}
