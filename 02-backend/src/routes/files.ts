import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { DocumentCategory } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { verifyActiveAccessToken, extractBearerToken } from '../middleware/auth';
import { requireHttpPermission, type AuthRequest } from '../middleware/httpPermission';
import { createDocument, getDocument, UPLOADS_DIR } from '../services/document';
import { assertIncidentWritable } from '../services/incident';
import { logAudit } from '../middleware/audit';
import { requireTenantId } from '../middleware/tenant';

const router = Router();

// ─── Multer — stockage temporaire sur disque ──────────────────────────────────
// Le fichier est d'abord écrit dans tmp/, puis déplacé vers le bon dossier cible
// une fois que req.body (incidentId, category…) est disponible.

const TEMP_DIR = path.join(UPLOADS_DIR, 'tmp');

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    cb(null, TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo
});

// ─── Middleware d'authentification ────────────────────────────────────────────

async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const payload = token ? await verifyActiveAccessToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }
  (req as AuthRequest).userId = payload.userId;
  next();
}

// ─── POST /api/files/upload ───────────────────────────────────────────────────

router.post('/upload', requireAuth, async (req, res, next) => {
  // B2 — vérifier DOCUMENTS:WRITE avant d'accepter le fichier
  const allowed = await requireHttpPermission(req as AuthRequest, res, 'DOCUMENTS', 'WRITE');
  if (!allowed) return;
  next();
}, upload.single('file'), async (req, res) => {
  // Le fichier reste provisoire tant que son
  // enregistrement en base n'est pas confirme.
  let uncommittedFilePath: string | null =
    req.file?.path ?? null;
  let documentCreated = false;

  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'Fichier manquant' }); return; }

    const userId = (req as AuthRequest).userId;
    const tenantId = await requireTenantId({ userId, req, res });
    const incidentId = req.body?.incidentId as string | undefined;
    const timelineEventId = req.body?.timelineEventId as string | undefined;
    const category = (req.body?.category as DocumentCategory | undefined) ?? 'OTHER';

    // Refuser les valeurs invalides avant tout deplacement
    // et avant l'appel a Prisma.
    if (!Object.values(DocumentCategory).includes(category)) {
      await fs.unlink(file.path).catch(() => undefined);
      uncommittedFilePath = null;
      res.status(400).json({
        error: 'Catégorie documentaire invalide',
      });
      return;
    }

    // B1 — valider que l'incidentId existe et est ouvert avant d'écrire sur disque
    if (incidentId) {
      try {
        await assertIncidentWritable(incidentId, userId); // F1 — bloque l'upload sur un incident clôturé ou supprimé
      } catch (err: unknown) {
        await fs.unlink(file.path).catch(() => undefined);
        const msg = err instanceof Error ? err.message : 'Incident introuvable ou clôturé';
        res.status(400).json({ error: msg });
        return;
      }
    }

    // Déplacer vers le dossier cible
    const targetDir = incidentId
      ? path.join(UPLOADS_DIR, 'incidents', incidentId)
      : path.join(UPLOADS_DIR, 'global');
    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, path.basename(file.path));
    await fs.rename(file.path, targetPath);
    uncommittedFilePath = targetPath;

    const relPath = path.relative(UPLOADS_DIR, targetPath).replace(/\\/g, '/');

    const doc = await createDocument({
      name: file.originalname,
      filePath: relPath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      category,
      uploadedById: userId,
      tenantId,
      incidentId: incidentId ?? null,
      timelineEventId: timelineEventId ?? null,
    }, req.ip);

    // La base reference maintenant le fichier.
    // Un incident de reponse HTTP ne doit pas
    // entrainer sa suppression.
    documentCreated = true;
    uncommittedFilePath = null;

    res.status(201).json(doc);
  } catch (err) {
    if (!documentCreated && uncommittedFilePath) {
      try {
        await fs.unlink(uncommittedFilePath);
      } catch (cleanupError) {
        // Ne pas masquer l'erreur principale.
        // Signaler toute impossibilite de nettoyage.
        console.error(
          '[upload] nettoyage impossible',
          cleanupError,
        );
      }
    }

    console.error('[upload]', err);

    if (!res.headersSent) {
      const code = err instanceof GraphQLError
        ? err.extensions.code
        : undefined;

      const status =
        code === 'BAD_USER_INPUT' ? 400 :
        code === 'NOT_FOUND' ? 404 :
        code === 'FORBIDDEN' ? 403 :
        code === 'UNAUTHENTICATED' ? 401 :
        500;

      // Ne pas exposer les details internes Prisma.
      const message = status === 500
        ? 'Erreur lors de l\'upload'
        : status === 400
          ? 'Requête documentaire invalide'
          : status === 404
            ? 'Ressource introuvable'
            : status === 401
              ? 'Non authentifié'
              : 'Accès refusé';

      res.status(status).json({ error: message });
    }
  }
});

// ─── GET /api/files/:id ───────────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    // A2 — vérifier DOCUMENTS:READ avant de servir le fichier
    const allowed = await requireHttpPermission(req as AuthRequest, res, 'DOCUMENTS', 'READ');
    if (!allowed) return;

    const userId = (req as AuthRequest).userId;
    const tenantId = await requireTenantId({ userId, req, res });
    const doc = await getDocument(req.params.id, tenantId);

    // A09 — tracer chaque téléchargement de document (accès à une ressource sensible)
    logAudit({
      userId: (req as AuthRequest).userId,
      action: 'DOWNLOAD',
      resource: 'DOCUMENT',
      resourceId: doc.id,
      incidentId: doc.incidentId ?? undefined,
      ipAddress: req.ip,
    });

    // F5 — garantir que le chemin résolu reste dans UPLOADS_DIR (path traversal)
    const resolved = path.resolve(UPLOADS_DIR, doc.filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep) && resolved !== path.resolve(UPLOADS_DIR)) {
      res.status(400).json({ error: 'Chemin de fichier invalide' });
      return;
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}"`);
    res.sendFile(resolved);
  } catch {
    res.status(404).json({ error: 'Document introuvable' });
  }
});

export default router;
