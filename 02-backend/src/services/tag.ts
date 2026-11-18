import { GraphQLError } from 'graphql';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

function tagNotFound(): never {
  throw new GraphQLError('Tag introuvable', {
    extensions: { code: 'NOT_FOUND' },
  });
}

function duplicateTag(): never {
  throw new GraphQLError('Un tag avec ce nom existe déjà', {
    extensions: { code: 'BAD_USER_INPUT' },
  });
}

export async function getTags(tenantId: string) {
  return prisma.tag.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

export async function createTag(
  name: string,
  color: string | null | undefined,
  userId: string,
  tenantId: string,
) {
  const existing = await prisma.tag.findFirst({
    where: { tenantId, name },
    select: { id: true },
  });

  if (existing) return duplicateTag();

  let tag;

  try {
    tag = await prisma.tag.create({
      data: {
        tenantId,
        name,
        color: color ?? '#6B7280',
      },
    });
  } catch (error) {
    // Deux creations simultanees du meme nom :
    // la contrainte unique PostgreSQL reste l'arbitre final.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return duplicateTag();
    }
    throw error;
  }

  logAudit({
    userId,
    action: 'CREATE',
    resource: 'TAG',
    resourceId: tag.id,
  });

  return tag;
}

export async function deleteTag(
  id: string,
  userId: string,
  tenantId: string,
) {
  await prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!tag) return tagNotFound();

    // Transaction atomique : les associations et le tag
    // sont supprimes ensemble ou pas du tout.
    await tx.logEntryTag.deleteMany({
      where: { tagId: id },
    });

    // Le tenant reste verifie au moment de supprimer.
    const result = await tx.tag.deleteMany({
      where: { id, tenantId },
    });

    if (result.count !== 1) return tagNotFound();
  });

  logAudit({
    userId,
    action: 'DELETE',
    resource: 'TAG',
    resourceId: id,
  });

  return true;
}
