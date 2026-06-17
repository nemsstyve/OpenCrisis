import { z } from 'zod';
import { GraphQLError } from 'graphql';

/**
 * Schéma de validation de mot de passe (DÉC-3).
 * Règles : 8 caractères minimum, 1 majuscule, 1 chiffre, 1 caractère spécial.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial');

/**
 * Parse un input via un schéma zod et lève une GraphQLError BAD_USER_INPUT
 * lisible côté client si la validation échoue (F1 — validation centralisée).
 */
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Données invalides';
    throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return result.data;
}

// ─── Champs réutilisables ───────────────────────────────────────────────────────

const shortText = (label: string) =>
  z.string().trim().min(1, `${label} est requis`).max(200, `${label} est trop long (200 max)`);
const optionalText = z.string().trim().max(2000).optional().nullable();
const optionalEmail = z
  .string()
  .trim()
  .email('Email invalide')
  .max(200)
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null));

const severityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const statusEnum = z.enum(['ACTIVE', 'CONTAINED', 'CLOSED']);
const timelineTypeEnum = z.enum([
  'DETECTION', 'ACTION', 'DECISION', 'COMMUNICATION', 'ESCALATION', 'RESOLUTION',
]);

// ─── Incident ───────────────────────────────────────────────────────────────────

export const createIncidentSchema = z.object({
  name: shortText('Le nom'),
  description: optionalText,
  severity: severityEnum.optional().nullable(),
});

export const updateIncidentSchema = z.object({
  name: shortText('Le nom').optional().nullable(),
  description: optionalText,
  status: statusEnum.optional().nullable(),
  severity: severityEnum.optional().nullable(),
});

// ─── Contact ────────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  firstName: shortText('Le prénom'),
  lastName: shortText('Le nom'),
  role: shortText('Le rôle'),
  organization: optionalText,
  phone: z.string().trim().max(50).optional().nullable(),
  email: optionalEmail,
  site: optionalText,
  notes: optionalText,
});

export const updateContactSchema = createContactSchema.partial();

// ─── Log entry (main courante) ──────────────────────────────────────────────────

export const createLogEntrySchema = z.object({
  content: z.string().trim().min(1, 'Le contenu est requis').max(10000),
});

// ─── Timeline ───────────────────────────────────────────────────────────────────

export const createTimelineEventSchema = z.object({
  type: timelineTypeEnum,
  title: shortText('Le titre'),
  description: optionalText,
  occurredAt: z.string().datetime({ message: 'Date invalide' }),
  isFirstDetection: z.boolean().optional().nullable(),
  actorId: z.string().uuid().optional().nullable(),
  ipAddress: z.string().trim().max(64).optional().nullable(),
  assetName: z.string().trim().max(200).optional().nullable(),
  affectedUser: z.string().trim().max(200).optional().nullable(),
  ioc: z.string().trim().max(500).optional().nullable(),
});

export const updateTimelineEventSchema = z.object({
  type: timelineTypeEnum.optional().nullable(),
  title: shortText('Le titre').optional().nullable(),
  description: optionalText,
  occurredAt: z.string().datetime({ message: 'Date invalide' }).optional().nullable(),
  isFirstDetection: z.boolean().optional().nullable(),
  ipAddress: z.string().trim().max(64).optional().nullable(),
  assetName: z.string().trim().max(200).optional().nullable(),
  affectedUser: z.string().trim().max(200).optional().nullable(),
  ioc: z.string().trim().max(500).optional().nullable(),
});

// ─── Tag ────────────────────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du tag est requis').max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hexadécimale invalide').optional(),
});

// ─── Admin — Utilisateurs ────────────────────────────────────────────────────────

const optionalPhone = z.string().trim().max(50).optional().nullable();
const optionalShort = z.string().trim().max(200).optional().nullable();

export const adminCreateUserSchema = z.object({
  email: z.string().trim().email('Email invalide').max(200),
  password: passwordSchema,
  firstName: shortText('Le prénom'),
  lastName: shortText('Le nom'),
  phone: optionalPhone,
  company: optionalShort,
  site: optionalShort,
});

export const adminUpdateUserSchema = z.object({
  firstName: shortText('Le prénom').optional().nullable(),
  lastName: shortText('Le nom').optional().nullable(),
  phone: optionalPhone,
  company: optionalShort,
  site: optionalShort,
  isActive: z.boolean().optional().nullable(),
});

// ─── Admin — Rôles ───────────────────────────────────────────────────────────────

export const adminCreateRoleSchema = z.object({
  name: shortText('Le nom du rôle'),
  description: optionalText,
  permissionIds: z.array(z.string().uuid()).min(1, 'Au moins une permission est requise'),
});
