import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { Cell } from '@prisma/client';
import { prisma } from '../prisma';
import { verifyAccessToken, extractBearerToken } from '../middleware/auth';
import { getUserReadableResources, type AuthRequest } from '../middleware/httpPermission';
import { logAudit } from '../middleware/audit';

const router = Router();

// ─── Middleware d'authentification ────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) { res.status(401).json({ error: 'Non authentifié' }); return; }
  (req as AuthRequest).userId = payload.userId;
  next();
}

// ─── Helper : cellules accessibles en lecture ─────────────────────────────────

async function getAccessibleCells(userId: string): Promise<Cell[]> {
  const resources = await getUserReadableResources(userId);
  const cells: Cell[] = [];
  if (resources.has('MAIN_COURANTE_DIR')) cells.push('DIRECTIONAL');
  if (resources.has('MAIN_COURANTE_OPS')) cells.push('OPERATIONAL');
  // SHARED visible dès qu'on a accès à au moins une cellule
  if (cells.length > 0) cells.push('SHARED');
  return cells;
}

const CELL_LABELS: Record<string, string> = {
  DIRECTIONAL: 'Cellule de Direction',
  OPERATIONAL: 'Cellule Opérationnelle',
  SHARED: 'Partagé',
};

const IOC_TYPE_LABELS: Record<string, string> = { hash: 'Hash', domain: 'Domaine', ip: 'IP' };

// Préfixe les valeurs débutant par un caractère de formule Excel (=, +, -, @, tab, CR)
// pour les traiter comme du texte brut et éviter l'injection de formule (CWE-1236).
function xlsxSafeString(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function formatIocsForExport(raw: string | null): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Array<{ iocType: string; value: string }>;
    if (Array.isArray(parsed)) return parsed.map((e) => `[${IOC_TYPE_LABELS[e.iocType] ?? e.iocType}] ${e.value}`).join('\n');
    return xlsxSafeString(raw);
  } catch { return xlsxSafeString(raw); }
}

// ─── GET /api/export/:incidentId/pdf ──────────────────────────────────────────
// Export de la main courante — filtré sur les cellules accessibles (DÉC-1)

router.get('/:incidentId/pdf', requireAuth, async (req, res) => {
  try {
    const { incidentId } = req.params;
    const userId = (req as AuthRequest).userId;

    const accessibleCells = await getAccessibleCells(userId);
    if (accessibleCells.length === 0) {
      res.status(403).json({ error: 'Permission refusée' });
      return;
    }

    const [incident, entries] = await Promise.all([
      prisma.incident.findFirst({ where: { id: incidentId, deletedAt: null } }),
      prisma.logEntry.findMany({
        where: { incidentId, deletedAt: null, cell: { in: accessibleCells } },
        include: {
          author: { select: { firstName: true, lastName: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!incident) { res.status(404).json({ error: 'Incident introuvable' }); return; }

    const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="main-courante-${incidentId.slice(0, 8)}.pdf"`,
    );
    doc.pipe(res);

    // ── Entête ──
    doc.font('Helvetica-Bold').fontSize(18).text('Main Courante — OpenCrisis', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(14).text(incident.name, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#888888')
      .text(`Statut : ${incident.status}  |  Sévérité : ${incident.severity}`, { align: 'center' });
    doc.text(`Ouvert le : ${new Date(incident.startedAt).toLocaleString('fr-FR')}`, { align: 'center' });
    doc.text(`Exporté le : ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });

    // Indiquer les cellules exportées
    const cellLabels = accessibleCells
      .filter(c => c !== 'SHARED')
      .map(c => CELL_LABELS[c] ?? c)
      .join(', ');
    doc.text(`Cellules : ${cellLabels}`, { align: 'center' });

    doc.fillColor('#000000');
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#333333').lineWidth(1).stroke();
    doc.moveDown(0.8);

    if (entries.length === 0) {
      doc.font('Helvetica').fontSize(11).text('Aucune entrée dans la main courante.', { align: 'center' });
    } else {
      for (const entry of entries) {
        const cell = CELL_LABELS[entry.cell] ?? entry.cell;
        const ts = new Date(entry.createdAt).toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        const author = `${entry.author.firstName} ${entry.author.lastName}`;

        doc.font('Helvetica').fontSize(8.5).fillColor('#666666')
          .text(`${ts}  •  ${author}  •  ${cell}`, { continued: false });

        if (entry.tags.length > 0) {
          doc.fontSize(8).text(`Tags : ${entry.tags.map((t) => t.tag.name).join(', ')}`);
        }

        doc.moveDown(0.1);
        doc.font('Helvetica').fontSize(10.5).fillColor('#111111').text(entry.content);
        doc.moveDown(0.4);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#dddddd').lineWidth(0.5).stroke();
        doc.moveDown(0.4);
      }
    }

    // F5 — pied de page numéroté sur chaque page.
    // On neutralise la marge basse pendant l'écriture pour éviter un saut de page
    // automatique (écrire près du bas de page déclencherait une page fantôme).
    const range = doc.bufferedPageRange();
    const summary = `OpenCrisis — ${entries.length} entrée${entries.length > 1 ? 's' : ''}`;
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#aaaaaa')
        .text(`${summary}  |  Page ${i + 1}/${range.count}`, 50, doc.page.height - 35, {
          align: 'center',
          lineBreak: false,
        });
      doc.page.margins.bottom = bottom;
    }

    logAudit({ userId, action: 'EXPORT', resource: 'MAIN_COURANTE', incidentId, ipAddress: req.ip });
    doc.end();
  } catch (err) {
    console.error('[export/pdf]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
});

// ─── GET /api/export/:incidentId/xlsx ─────────────────────────────────────────
// Export de l'incident — main courante filtrée sur les cellules accessibles (DÉC-1)

router.get('/:incidentId/xlsx', requireAuth, async (req, res) => {
  try {
    const { incidentId } = req.params;
    const userId = (req as AuthRequest).userId;

    const accessibleCells = await getAccessibleCells(userId);
    if (accessibleCells.length === 0) {
      res.status(403).json({ error: 'Permission refusée' });
      return;
    }

    // N2 — la timeline n'est exportée que si l'utilisateur dispose de TIMELINE:READ
    const canReadTimeline = (await getUserReadableResources(userId)).has('TIMELINE');

    const [incident, entries, timelineEvents] = await Promise.all([
      prisma.incident.findFirst({ where: { id: incidentId, deletedAt: null } }),
      prisma.logEntry.findMany({
        where: { incidentId, deletedAt: null, cell: { in: accessibleCells } },
        include: {
          author: { select: { firstName: true, lastName: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      canReadTimeline
        ? prisma.timelineEvent.findMany({
            where: { incidentId, deletedAt: null },
            include: { actor: { select: { firstName: true, lastName: true } } },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    if (!incident) { res.status(404).json({ error: 'Incident introuvable' }); return; }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OpenCrisis';
    workbook.created = new Date();

    // ── Feuille 1 : Résumé incident ──
    const infoSheet = workbook.addWorksheet('Incident');
    infoSheet.columns = [
      { key: 'label', width: 25 },
      { key: 'value', width: 60 },
    ];
    infoSheet.getColumn('label').font = { bold: true };
    infoSheet.addRows([
      { label: 'Nom', value: incident.name },
      { label: 'Description', value: incident.description ?? '' },
      { label: 'Statut', value: incident.status },
      { label: 'Sévérité', value: incident.severity },
      { label: 'Ouvert le', value: new Date(incident.startedAt).toLocaleString('fr-FR') },
      { label: 'Clos le', value: incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString('fr-FR') : '' },
      { label: 'Exporté le', value: new Date().toLocaleString('fr-FR') },
    ]);

    // ── Feuille 2 : Main Courante (filtrée) ──
    const logSheet = workbook.addWorksheet('Main Courante');
    logSheet.columns = [
      { header: 'Horodatage', key: 'createdAt', width: 22 },
      { header: 'Auteur', key: 'author', width: 26 },
      { header: 'Cellule', key: 'cell', width: 22 },
      { header: 'Contenu', key: 'content', width: 70 },
      { header: 'Tags', key: 'tags', width: 28 },
      { header: 'Modifié', key: 'isEdited', width: 10 },
    ];
    const logHeader = logSheet.getRow(1);
    logHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    logHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    const CELL_LABELS_SHORT: Record<string, string> = {
      DIRECTIONAL: 'Direction',
      OPERATIONAL: 'Opérationnelle',
      SHARED: 'Partagé',
    };

    for (const entry of entries) {
      const row = logSheet.addRow({
        createdAt: new Date(entry.createdAt).toLocaleString('fr-FR'),
        author: `${entry.author.firstName} ${entry.author.lastName}`,
        cell: CELL_LABELS_SHORT[entry.cell] ?? entry.cell,
        content: entry.content,
        tags: entry.tags.map((t) => t.tag.name).join(', '),
        isEdited: entry.isEdited ? 'Oui' : 'Non',
      });
      row.getCell('content').alignment = { wrapText: true, vertical: 'top' };
    }

    // ── Feuille 3 : Timeline ──
    const tlSheet = workbook.addWorksheet('Timeline');
    tlSheet.columns = [
      { header: 'Date / Heure', key: 'occurredAt', width: 22 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Titre', key: 'title', width: 42 },
      { header: 'Description', key: 'description', width: 55 },
      { header: 'Acteur', key: 'actor', width: 26 },
      { header: 'Asset', key: 'assetName', width: 20 },
      { header: 'Adresse IP', key: 'ipAddress', width: 16 },
      { header: 'IOC', key: 'ioc', width: 36 },
      { header: 'Utilisateur affecté', key: 'affectedUser', width: 28 },
    ];
    const tlHeader = tlSheet.getRow(1);
    tlHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tlHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };

    const TYPE_LABELS: Record<string, string> = {
      DETECTION: 'Détection',
      ACTION: 'Action',
      DECISION: 'Décision',
      COMMUNICATION: 'Communication',
      ESCALATION: 'Escalade',
      RESOLUTION: 'Résolution',
    };

    for (const event of timelineEvents) {
      const row = tlSheet.addRow({
        occurredAt: new Date(event.occurredAt).toLocaleString('fr-FR'),
        type: TYPE_LABELS[event.type] ?? event.type,
        title: event.title,
        description: event.description ?? '',
        actor: event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : '',
        assetName: event.assetName ?? '',
        ipAddress: event.ipAddress ?? '',
        ioc: formatIocsForExport(event.ioc),
        affectedUser: event.affectedUser ?? '',
      });
      row.getCell('ioc').alignment = { wrapText: true, vertical: 'top' };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rapport-${incidentId.slice(0, 8)}.xlsx"`,
    );

    logAudit({ userId, action: 'EXPORT', resource: 'INCIDENT', incidentId, ipAddress: req.ip });
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[export/xlsx]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur lors de la génération Excel' });
  }
});

export default router;
