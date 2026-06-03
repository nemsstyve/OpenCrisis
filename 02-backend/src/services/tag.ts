import { GraphQLError } from 'graphql';
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
  await prisma.tag.delete({ where: { id } });
  logAudit({ userId, action: 'DELETE', resource: 'TAG', resourceId: id });
  return true;
}
