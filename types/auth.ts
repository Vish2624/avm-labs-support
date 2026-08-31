export type UserRole = "agent" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Session {
  user: AuthUser;
  expiresAt: string;
}
