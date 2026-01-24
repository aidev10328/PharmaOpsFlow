import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch (e) {
      return { status: 'not_ready', database: 'disconnected' };
    }
  }
}
