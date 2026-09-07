// =====================================================
// Auth-related shared types.
// Defined in one place so jwt.strategy, services, controllers all agree.
// =====================================================

export interface JwtPayload {
  sub: string; // userId
  companyId: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[]; // role keys, e.g. "company_admin"
  permissions: string[]; // permission keys, e.g. "users.read"
}

export interface SafeUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: { id: string; key: string; name: string }[];
  permissions: string[];
}

export interface AuthResponseBody {
  accessToken: string;
  user: SafeUser;
}
