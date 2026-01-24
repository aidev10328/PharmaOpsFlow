import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        org: { select: { id: true, name: true } },
      },
    });
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    // Include role and orgId in JWT payload for authorization checks
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };

    // Fetch pharmacy memberships for the response
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

    const { passwordHash: _, ...result } = user;
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

    const { passwordHash, ...result } = user;
    return result;
  }
}
