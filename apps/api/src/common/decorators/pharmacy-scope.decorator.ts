import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '../enums/role.enum';

export const PHARMACY_SCOPE_KEY = 'pharmacy_scope';

export interface PharmacyScopeOptions {
  paramName?: string; // Route param name for pharmacyId (default: 'pharmacyId')
  allowedMemberRoles?: MemberRole[]; // Required member roles (default: all)
  allowOrgManagers?: boolean; // Allow COMPANY_MANAGER of the same org (default: true)
}

export const PharmacyScope = (options: PharmacyScopeOptions = {}) =>
  SetMetadata(PHARMACY_SCOPE_KEY, {
    paramName: options.paramName ?? 'pharmacyId',
    allowedMemberRoles: options.allowedMemberRoles ?? [
      MemberRole.PHARMACY_ADMIN,
      MemberRole.PHARMACY_USER,
      MemberRole.READ_ONLY,
    ],
    allowOrgManagers: options.allowOrgManagers ?? true,
  });
