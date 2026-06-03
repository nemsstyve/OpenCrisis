import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

async function getContact(id: string) {
  const contact = await prisma.contact.findFirst({ where: { id, deletedAt: null } });
  if (!contact) throw new GraphQLError('Contact introuvable', { extensions: { code: 'NOT_FOUND' } });
  return contact;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getContacts(incidentId?: string | null) {
  if (incidentId) {
    // Contacts liés à cet incident + contacts globaux
    const links = await prisma.incidentContact.findMany({
      where: { incidentId },
      include: { contact: true },
    });
    return links.map(l => l.contact).filter(c => c.deletedAt === null);
  }
  return prisma.contact.findMany({ where: { deletedAt: null, isGlobal: true }, orderBy: { lastName: 'asc' } });
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
  isGlobal?: boolean | null;
};

export async function createContact(
  input: ContactInput,
  createdById: string,
  incidentId?: string | null,
  ipAddress?: string | null,
) {
  const contact = await prisma.contact.create({
    data: {
      ...input,
      isGlobal: input.isGlobal ?? true,
      createdById,
    },
  });
  if (incidentId) {
    await prisma.incidentContact.create({ data: { incidentId, contactId: contact.id } });
  }
  logAudit({ userId: createdById, action: 'CREATE', resource: 'CONTACT', resourceId: contact.id, incidentId: incidentId ?? undefined, ipAddress });
  return contact;
}

export async function updateContact(
  id: string,
  input: Partial<Omit<ContactInput, 'isGlobal'>>,
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

export async function linkContactToIncident(contactId: string, incidentId: string, userId: string) {
  await prisma.incidentContact.upsert({
    where: { incidentId_contactId: { incidentId, contactId } },
    create: { incidentId, contactId },
    update: {},
  });
  logAudit({ userId, action: 'LINK', resource: 'CONTACT', resourceId: contactId, incidentId });
  return true;
}

export async function unlinkContactFromIncident(contactId: string, incidentId: string, userId: string) {
  await prisma.incidentContact.deleteMany({ where: { incidentId, contactId } });
  logAudit({ userId, action: 'UNLINK', resource: 'CONTACT', resourceId: contactId, incidentId });
  return true;
}
