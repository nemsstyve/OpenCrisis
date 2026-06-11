import { GraphQLError } from 'graphql';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

export async function getTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function createTag(name: string, color: string | null | undefined, userId: string) {
  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) throw new GraphQLError('Un tag avec ce nom existe déjà', { extensions: { code: 'BAD_USER_INPUT' } });

  const tag = await prisma.tag.create({ data: { name, color: color ?? '#6B7280' } });
  logAudit({ userId, action: 'CREATE', resource: 'TAG', resourceId: tag.id });
  return tag;
}

export async function deleteTag(id: string, userId: string) {
  try {
    // Détacher les associations puis supprimer le tag de façon atomique.
    // Si le tag a déjà été supprimé entre temps, Prisma lève P2025.
    await prisma.$transaction([
      prisma.logEntryTag.deleteMany({ where: { tagId: id } }),
      prisma.tag.delete({ where: { id } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new GraphQLError('Tag introuvable', { extensions: { code: 'NOT_FOUND' } });
    }
    throw e;
  }
  logAudit({ userId, action: 'DELETE', resource: 'TAG', resourceId: id });
  return true;
}
