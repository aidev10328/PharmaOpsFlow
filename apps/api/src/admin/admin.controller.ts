import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';
import {
  UpdateOrgDto,
  CreatePharmacyDto,
  UpdatePharmacyDto,
  CreateUserDto,
  UpdateUserDto,
  AddMemberDto,
} from './dto';

@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ===== Organization =====

  @Get('org')
  async getOrg(@Request() req: any) {
    return this.adminService.getOrg(req.user.orgId);
  }

  @Patch('org')
  async updateOrg(@Body() dto: UpdateOrgDto, @Request() req: any) {
    return this.adminService.updateOrg(req.user.orgId, dto, req.user.id);
  }

  // ===== Pharmacies =====

  @Get('pharmacies')
  async listPharmacies() {
    return this.adminService.listPharmacies();
  }

  @Post('pharmacies')
  async createPharmacy(@Body() dto: CreatePharmacyDto, @Request() req: any) {
    return this.adminService.createPharmacy(dto, req.user.id);
  }

  @Patch('pharmacies/:id')
  async updatePharmacy(
    @Param('id') id: string,
    @Body() dto: UpdatePharmacyDto,
    @Request() req: any,
  ) {
    return this.adminService.updatePharmacy(id, dto, req.user.id);
  }

  @Post('pharmacies/:id/deactivate')
  async deactivatePharmacy(@Param('id') id: string, @Request() req: any) {
    return this.adminService.deactivatePharmacy(id, req.user.id);
  }

  @Post('pharmacies/:id/reactivate')
  async reactivatePharmacy(@Param('id') id: string, @Request() req: any) {
    return this.adminService.reactivatePharmacy(id, req.user.id);
  }

  // ===== Users =====

  @Get('users')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  async createUser(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.adminService.createUser(dto, req.user.id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.adminService.updateUser(id, dto, req.user.id);
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Request() req: any) {
    return this.adminService.resetPassword(id, req.user.id);
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string, @Request() req: any) {
    return this.adminService.disableUser(id, req.user.id);
  }

  @Post('users/:id/enable')
  async enableUser(@Param('id') id: string, @Request() req: any) {
    return this.adminService.enableUser(id, req.user.id);
  }

  // ===== Pharmacy Members =====

  @Get('pharmacies/:id/members')
  async listMembers(@Param('id') id: string) {
    return this.adminService.listMembers(id);
  }

  @Post('pharmacies/:id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Request() req: any,
  ) {
    return this.adminService.addMember(id, dto, req.user.id);
  }

  @Delete('pharmacies/:id/members/:memberId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.adminService.removeMember(id, memberId, req.user.id);
  }
}
