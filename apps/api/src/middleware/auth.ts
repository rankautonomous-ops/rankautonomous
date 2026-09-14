import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import prisma from '../lib/database';
import { AuthenticatedUser } from '../types/auth';

/**
 * Extracts and verifies the Supabase Bearer token from the Authorization header,
 * synchronizes the user with the Prisma database, and attaches the user to req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header. Expected Bearer token.',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Empty authentication token provided.',
      });
      return;
    }

    // Verify token with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid, expired, or revoked authentication token.',
      });
      return;
    }

    const supabaseUser = authData.user;
    const email = supabaseUser.email;

    if (!email) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Authenticated Supabase user does not have an associated email.',
      });
      return;
    }

    // Synchronize user in Prisma database
    let user = await prisma.user.findUnique({
      where: { supabaseAuthId: supabaseUser.id },
    });

    if (!user) {
      // Check if user exists by email (e.g. pre-provisioned or seeded)
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        // Link existing user with supabaseAuthId
        user = await prisma.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            supabaseAuthId: supabaseUser.id,
            name: existingUserByEmail.name || supabaseUser.user_metadata?.name || null,
          },
        });
      } else {
        // Create new User record with default CUSTOMER role
        try {
          user = await prisma.user.create({
            data: {
              supabaseAuthId: supabaseUser.id,
              email,
              name: supabaseUser.user_metadata?.name || null,
              role: 'CUSTOMER',
            },
          });
        } catch (createError: any) {
          // Handle potential race condition where another request created the user concurrently
          if (createError?.code === 'P2002') {
            user = await prisma.user.findUnique({
              where: { supabaseAuthId: supabaseUser.id },
            });
            if (!user) {
              user = await prisma.user.findUnique({
                where: { email },
              });
            }
          } else {
            throw createError;
          }
        }
      }
    }

    if (!user) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to synchronize authenticated user record.',
      });
      return;
    }

    // Attach authenticated user to request context
    req.user = {
      id: user.id,
      supabaseAuthId: user.supabaseAuthId || supabaseUser.id,
      email: user.email,
      name: user.name,
      role: user.role as 'CUSTOMER' | 'ADMIN',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (error: any) {
    console.error('[Auth Middleware Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while verifying authentication.',
    });
  }
}

/**
 * Ensures the authenticated user has CUSTOMER or ADMIN privileges.
 */
export function requireCustomer(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required.',
    });
    return;
  }

  if (req.user.role !== 'CUSTOMER' && req.user.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access restricted to customer accounts.',
    });
    return;
  }

  next();
}

/**
 * Ensures the authenticated user has ADMIN privileges.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required.',
    });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access restricted to administrative accounts.',
    });
    return;
  }

  next();
}
