import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import type { DocumentCategory } from '@prisma/client';
import { verifyAccessToken, extractBearerToken } from '../middleware/auth';
import { requireHttpPermission, type AuthRequest } from '../middleware/httpPermission';
import { createDocument, getDocument, UPLOADS_DIR } from '../services/document';
import { logAudit } from '../middleware/audit';
import { prisma } from '../prisma';

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

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  const payload = token ? verifyAccessToken(token) : null;
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
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'Fichier manquant' }); return; }

    const userId = (req as AuthRequest).userId;
    const incidentId = req.body?.incidentId as string | undefined;
    const timelineEventId = req.body?.timelineEventId as string | undefined;
    const category = (req.body?.category as DocumentCategory | undefined) ?? 'OTHER';

    // B1 — valider que l'incidentId existe avant d'écrire sur disque
    if (incidentId) {
      const incident = await prisma.incident.findFirst({
        where: { id: incidentId, deletedAt: null },
        select: { id: true },
      });
      if (!incident) {
        await fs.unlink(file.path).catch(() => undefined);
        res.status(400).json({ error: 'Incident introuvable' });
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

    const relPath = path.relative(UPLOADS_DIR, targetPath).replace(/\\/g, '/');

    const doc = await createDocument({
      name: file.originalname,
      filePath: relPath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      category,
      uploadedById: userId,
      incidentId: incidentId ?? null,
      timelineEventId: timelineEventId ?? null,
    }, req.ip);

    res.status(201).json(doc);
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

// ─── GET /api/files/:id ───────────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    // A2 — vérifier DOCUMENTS:READ avant de servir le fichier
    const allowed = await requireHttpPermission(req as AuthRequest, res, 'DOCUMENTS', 'READ');
    if (!allowed) return;

    const doc = await getDocument(req.params.id);

    // A09 — tracer chaque téléchargement de document (accès à une ressource sensible)
    logAudit({
      userId: (req as AuthRequest).userId,
      action: 'DOWNLOAD',
      resource: 'DOCUMENT',
      resourceId: doc.id,
      incidentId: doc.incidentId ?? undefined,
      ipAddress: req.ip,
    });

    const filePath = path.join(UPLOADS_DIR, doc.filePath);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}"`);
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: 'Document introuvable' });
  }
});

export default router;
