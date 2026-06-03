import { GraphQLError } from 'graphql';
import path from 'path';
import fs from 'fs/promises';
import type { DocumentCategory } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';

export const UPLOADS_DIR = '/app/uploads';

const DOCUMENT_INCLUDE = {
  uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
} as const;

async function getDoc(id: string) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null }, include: DOCUMENT_INCLUDE });
  if (!doc) throw new GraphQLError('Document introuvable', { extensions: { code: 'NOT_FOUND' } });
  return doc;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getDocuments(incidentId?: string | null, category?: DocumentCategory | null) {
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      // III5 — undefined → bibliothèque globale (incidentId = null) ; string → docs incident
      incidentId: incidentId !== undefined ? incidentId : null,
      ...(category != null ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: DOCUMENT_INCLUDE,
  });
}

export async function getDocument(id: string) {
  return getDoc(id);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createDocument(params: {
  name: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  uploadedById: string;
  incidentId?: string | null;
  timelineEventId?: string | null;
}, ipAddress?: string | null) {
  const doc = await prisma.document.create({
    data: params,
    include: DOCUMENT_INCLUDE,
  });
  logAudit({ userId: params.uploadedById, action: 'UPLOAD', resource: 'DOCUMENT', resourceId: doc.id, incidentId: params.incidentId ?? undefined, ipAddress });
  if (params.incidentId) {
    pubsub.publish(TOPICS.DOCUMENT_UPLOADED(params.incidentId), { documentUploaded: doc });
  }
  return doc;
}

export async function deleteDocument(id: string, userId: string, ipAddress?: string | null) {
  const doc = await getDoc(id);
  // Soft delete en base
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  // Supprimer le fichier physique (best-effort)
  fs.unlink(path.join(UPLOADS_DIR, doc.filePath)).catch(() => undefined);
  logAudit({ userId, action: 'DELETE', resource: 'DOCUMENT', resourceId: id, incidentId: doc.incidentId ?? undefined, ipAddress });
  return true;
}
