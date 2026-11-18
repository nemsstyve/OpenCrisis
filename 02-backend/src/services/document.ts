import { GraphQLError } from 'graphql';
import type { DocumentCategory } from '@prisma/client';
import { prisma } from '../prisma';
import { removeVerifiedUpload } from './fileStorageSafety';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';
import { assertIncidentWritable, getIncident } from './incident';
import { requireTenantId } from '../middleware/tenant';

export const UPLOADS_DIR = '/app/uploads';

const DOCUMENT_INCLUDE = {
  uploadedBy: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} as const;

function notFound(): never {
  throw new GraphQLError('Document introuvable', {
    extensions: { code: 'NOT_FOUND' },
  });
}

async function getDoc(id: string, tenantId: string) {
  if (!tenantId) return notFound();

  const doc = await prisma.document.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: DOCUMENT_INCLUDE,
  });

  if (!doc) return notFound();
  return doc;
}

export async function getDocuments(
  tenantId: string,
  incidentId?: string | null,
  category?: DocumentCategory | null,
) {
  if (!tenantId) return notFound();

  if (incidentId) {
    await getIncident(incidentId, tenantId);
  }

  return prisma.document.findMany({
    where: {
      tenantId,
      deletedAt: null,
      incidentId: incidentId !== undefined ? incidentId : null,
      ...(category != null ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: DOCUMENT_INCLUDE,
  });
}

export async function getDocument(id: string, tenantId: string) {
  return getDoc(id, tenantId);
}

export async function createDocument(params: {
  name: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  uploadedById: string;
  tenantId: string;
  incidentId?: string | null;
  timelineEventId?: string | null;
}, ipAddress?: string | null) {
  const activeTenantId = await requireTenantId({
    userId: params.uploadedById,
    req: null,
    res: null,
  });

  if (activeTenantId !== params.tenantId) {
    throw new GraphQLError('Accès refusé', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  if (params.incidentId) {
    await assertIncidentWritable(params.incidentId, params.uploadedById);
  }

  if (params.timelineEventId) {
    if (!params.incidentId) {
      throw new GraphQLError('Incident requis pour cet événement', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const event = await prisma.timelineEvent.findFirst({
      where: {
        id: params.timelineEventId,
        deletedAt: null,
        incidentId: params.incidentId,
        incident: { tenantId: params.tenantId, deletedAt: null },
      },
      select: { id: true },
    });

    if (!event) {
      throw new GraphQLError('Événement introuvable', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
  }

  const doc = await prisma.document.create({
    data: params,
    include: DOCUMENT_INCLUDE,
  });

  // Le document est deja cree en base.
  // La journalisation et les notifications ne doivent
  // jamais provoquer la suppression de son fichier.
  try {
    logAudit({
      userId: params.uploadedById,
      action: 'UPLOAD',
      resource: 'DOCUMENT',
      resourceId: doc.id,
      incidentId: params.incidentId ?? undefined,
      ipAddress,
    });
  } catch (error) {
    console.error(
      '[document] audit post-creation echoue',
      error,
    );
  }

  if (params.incidentId) {
    try {
      void Promise.resolve(
        pubsub.publish(
          TOPICS.DOCUMENT_UPLOADED(params.incidentId),
          { documentUploaded: doc },
        ),
      ).catch(error => {
        console.error(
          '[document] notification post-creation echouee',
          error,
        );
      });
    } catch (error) {
      console.error(
        '[document] notification post-creation echouee',
        error,
      );
    }
  }

  return doc;
}

export async function deleteDocument(
  id: string,
  userId: string,
  tenantId: string,
  ipAddress?: string | null,
) {
  const activeTenantId = await requireTenantId({
    userId,
    req: null,
    res: null,
  });

  if (activeTenantId !== tenantId) {
    throw new GraphQLError('Accès refusé', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const doc = await getDoc(id, tenantId);

  if (doc.incidentId) {
    await assertIncidentWritable(doc.incidentId, userId);
  }

  const result = await prisma.document.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count !== 1) return notFound();

  void removeVerifiedUpload(
    UPLOADS_DIR,
    doc.filePath,
  ).catch(error => {
    console.error(
      '[document] suppression physique refusee ou impossible',
      error,
    );
  });

  logAudit({
    userId,
    action: 'DELETE',
    resource: 'DOCUMENT',
    resourceId: id,
    incidentId: doc.incidentId ?? undefined,
    ipAddress,
  });

  return true;
}
