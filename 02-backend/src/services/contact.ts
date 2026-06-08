import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

async function getContact(id: string) {
  const contact = await prisma.contact.findFirst({ where: { id, deletedAt: null } });
  if (!contact) throw new GraphQLError('Contact introuvable', { extensions: { code: 'NOT_FOUND' } });
  return contact;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getContacts() {
  return prisma.contact.findMany({ where: { deletedAt: null }, orderBy: { lastName: 'asc' } });
}

export async function getContactById(id: string) {
  return getContact(id);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

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
  ipAddress?: string | null,
) {
  const contact = await prisma.contact.create({
    data: { ...input, createdById },
  });
  logAudit({ userId: createdById, action: 'CREATE', resource: 'CONTACT', resourceId: contact.id, ipAddress });
  return contact;
}

export async function updateContact(
  id: string,
  input: Partial<ContactInput>,
  userId: string,
  ipAddress?: string | null,
) {
  await getContact(id);
  const contact = await prisma.contact.update({ where: { id }, data: input });
  logAudit({ userId, action: 'UPDATE', resource: 'CONTACT', resourceId: id, ipAddress });
  return contact;
}

export async function deleteContact(id: string, userId: string, ipAddress?: string | null) {
  await getContact(id);
  await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  logAudit({ userId, action: 'DELETE', resource: 'CONTACT', resourceId: id, ipAddress });
  return true;
}
