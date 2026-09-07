// Shared types — mirror backend SafeUser in backend/src/common/types/auth.types.ts
export interface SafeUserRole {
  id: string;
  key: string;
  name: string;
}
export interface SafeUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: SafeUserRole[];
  permissions: string[];
}
