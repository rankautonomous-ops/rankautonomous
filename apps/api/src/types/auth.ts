export type UserRole = 'CUSTOMER' | 'ADMIN';

export interface AuthenticatedUser {
  id: string;
  supabaseAuthId: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
