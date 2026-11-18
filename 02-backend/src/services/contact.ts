import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

function contactNotFound(): never {
  throw new GraphQLError('Contact introuvable', {
    extensions: { code: 'NOT_FOUND' },
  });
}

async function getContact(id: string, tenantId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!contact) return contactNotFound();
  return contact;
}

export async function getContacts(tenantId: string) {
  return prisma.contact.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { lastName: 'asc' },
  });
}

export async function getContactById(id: string, tenantId: string) {
  return getContact(id, tenantId);
}

type ContactInput = {
  firstName: string;
  lastName: string;
  role: string;
  organization?: string | null;
  phone?: string | null;
  email?: string | null;
  site?: string | null;
  notes?: string | null;
};

export async function createContact(
  input: ContactInput,
  createdById: string,
  tenantId: string,
  ipAddress?: string | null,
) {
  const contact = await prisma.contact.create({
    data: { ...input, createdById, tenantId },
  });

  logAudit({
    userId: createdById,
    action: 'CREATE',
    resource: 'CONTACT',
    resourceId: contact.id,
    ipAddress,
  });

  return contact;
}

export async function updateContact(
  id: string,
  input: Partial<ContactInput>,
  userId: string,
  tenantId: string,
  ipAddress?: string | null,
) {
  const result = await prisma.contact.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: input,
  });

  if (result.count !== 1) return contactNotFound();

  const contact = await getContact(id, tenantId);

  logAudit({
    userId,
    action: 'UPDATE',
    resource: 'CONTACT',
    resourceId: id,
    ipAddress,
  });

  return contact;
}

export async function deleteContact(
  id: string,
  userId: string,
  tenantId: string,
  ipAddress?: string | null,
) {
  const result = await prisma.contact.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count !== 1) return contactNotFound();

  logAudit({
    userId,
    action: 'DELETE',
    resource: 'CONTACT',
    resourceId: id,
    ipAddress,
  });

  return true;
}
