import { PrismaClient, Prisma } from '@prisma/client';
import { log } from './logger';

// Create a singleton instance of PrismaClient
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Helper function to handle Prisma errors
export function handlePrismaError(error: unknown): never {
  const errorInfo = {
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
  };

  log.error('Database error:', errorInfo);
  throw error;
}

// Transaction helper
export const withTransaction = async <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> => {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
    log.error('Transaction failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log.error('Database health check failed:', error);
    return false;
  }
}

export default prisma; 