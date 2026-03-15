import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  private mailer: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    this.mailer = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST') || '127.0.0.1',
      port: parseInt(this.config.get('SMTP_PORT') || '54325', 10),
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        org: { select: { id: true, name: true } },
      },
    });
    if (!user) return null;
    if (!user.isActive) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash, passwordResetToken, passwordResetExpires, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };

    const memberships = await this.prisma.pharmacyMember.findMany({
      where: { userId: user.id },
      include: {
        pharmacy: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return {
      ok: true,
      access_token: this.jwtService.sign(payload),
      mustChangePassword: user.mustChangePassword || false,
      user: {
        ...user,
        pharmacyMemberships: memberships,
      },
    };
  }

  async register(data: { email: string; password: string; firstName?: string; lastName?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
      },
      include: {
        org: { select: { id: true, name: true } },
      },
    });

    const { passwordHash: _, passwordResetToken, passwordResetExpires, ...result } = user;
    return this.login(result);
  }

  async getFullUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        org: { select: { id: true, name: true } },
        pharmacyMemberships: {
          include: {
            pharmacy: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!user) return null;

    const { passwordHash, passwordResetToken, passwordResetExpires, ...result } = user;
    return result;
  }

  // ===== Forgot Password =====

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return { ok: true, message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    const webUrl = this.config.get('CORS_ORIGIN')?.split(',')[0] || 'http://localhost:3003';
    const resetLink = `${webUrl}/reset-password?token=${token}`;

    try {
      await this.mailer.sendMail({
        from: this.config.get('SMTP_FROM') || 'noreply@pharmaopsflow.local',
        to: email,
        subject: 'PharmaOpsFlow - Reset Your Password',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Reset Your Password</h2>
            <p>Hi ${user.firstName || user.email.split('@')[0]},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Reset Password
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px;">PharmaOpsFlow</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send reset email:', err);
    }

    return { ok: true, message: 'If that email exists, a reset link has been sent.' };
  }

  // ===== Reset Password via Token (from email link) =====

  async resetPasswordByToken(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Invalid or expired reset link. Please request a new one.');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        mustChangePassword: false,
      },
    });

    return { ok: true, message: 'Password has been reset successfully. You can now sign in.' };
  }

  // ===== Change Password (logged-in user) =====

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return { ok: true, message: 'Password changed successfully' };
  }

  // ===== Force Change Password (after admin reset) =====

  async forceChangePassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.mustChangePassword) {
      throw new BadRequestException('Password change is not required');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return { ok: true, message: 'Password changed successfully' };
  }
}
