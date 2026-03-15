import { Controller, Post, Body, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return this.authService.getFullUser(req.user.id);
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string; firstName?: string; lastName?: string }) {
    return this.authService.register(body);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPasswordByToken(body.token, body.password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @Post('force-change-password')
  @UseGuards(JwtAuthGuard)
  async forceChangePassword(
    @Req() req: any,
    @Body() body: { newPassword: string },
  ) {
    return this.authService.forceChangePassword(req.user.id, body.newPassword);
  }
}
