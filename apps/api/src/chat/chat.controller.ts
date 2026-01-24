import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ChatService } from './chat.service';
import { ChatPlanRequestDto, ChatExecuteRequestDto } from './dto/chat.dto';

@Controller('v1/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * Check if chat is enabled
   */
  @Get('status')
  getStatus() {
    return {
      enabled: this.chatService.isAiEnabled(),
      provider: process.env.AI_PROVIDER || 'openai',
    };
  }

  /**
   * Generate a query plan from natural language
   */
  @Post('plan')
  @HttpCode(HttpStatus.OK)
  async planQuery(@Body() dto: ChatPlanRequestDto, @Request() req: any) {
    this.logger.log(`Planning query for user ${req.user.id}: "${dto.message}"`);

    const result = await this.chatService.planQuery(
      dto,
      req.user.id,
      req.user.orgId,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Execute a query plan
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async executeQuery(@Body() dto: ChatExecuteRequestDto, @Request() req: any) {
    this.logger.log(
      `Executing query plan for user ${req.user.id}: intent=${dto.queryPlan?.intent}`,
    );

    const result = await this.chatService.executeQuery(
      dto,
      req.user.id,
      req.user.orgId,
    );

    return {
      success: true,
      data: result,
    };
  }
}
