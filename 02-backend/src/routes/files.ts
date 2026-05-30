import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import type { DocumentCategory } from '@prisma/client';
import { verifyAccessToken, extractBearerToken } from '../middleware/auth';
import { createDocument, getDocument, UPLOADS_DIR } from '../services/document';

type AuthRequest = Request & { userId: string };

const router = Router();

// ─── Multer — stockage sur disque ─────────────────────────────────────────────

// Les fichiers sont d'abord écrits dans un dossier temporaire.
// Le gestionnaire de route les déplace ensuite dans le bon dossier
// (incidents/:id/ ou global/) une fois que req.body est disponible.
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

// ─── Auth middleware ───────────────────────────────────────────────────────────

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

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'Fichier manquant' }); return; }

    const userId = (req as AuthRequest).userId;
    const incidentId = req.body?.incidentId as string | undefined;
    const timelineEventId = req.body?.timelineEventId as string | undefined;
    const category = (req.body?.category as DocumentCategory | undefined) ?? 'OTHER';

    // Déplacer le fichier du dossier tmp vers le bon dossier cible
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
    const doc = await getDocument(req.params.id);
    const filePath = path.join(UPLOADS_DIR, doc.filePath);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}"`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ error: 'Document introuvable' });
  }
});

export default router;
