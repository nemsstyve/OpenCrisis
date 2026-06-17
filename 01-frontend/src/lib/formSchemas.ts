import { z } from "zod";

// Schémas de validation client (VII1) — cohérents avec la validation backend.

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} est requis`).max(200, `${label} est trop long`);
const optionalEmail = z
  .string()
  .trim()
  .email("Email invalide")
  .max(200)
  .optional()
  .or(z.literal(""));

export const loginSchema = z.object({
  email: z.string().trim().min(1, "L'email est requis").email("Email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const incidentSchema = z.object({
  name: requiredText("Le nom"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});
export type IncidentForm = z.infer<typeof incidentSchema>;

export const contactSchema = z.object({
  firstName: requiredText("Le prénom"),
  lastName: requiredText("Le nom"),
  role: requiredText("Le rôle"),
  organization: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  email: optionalEmail,
  site: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type ContactForm = z.infer<typeof contactSchema>;

// Champs optionnels gardés en chaînes requises (vides autorisées) pour coller
// au type de formulaire local NewEventForm (tous les champs présents).
const passwordComplexity = z
  .string()
  .min(8, "8 caractères minimum")
  .regex(/[A-Z]/, "1 majuscule requise")
  .regex(/[0-9]/, "1 chiffre requis")
  .regex(/[^A-Za-z0-9]/, "1 caractère spécial requis");

// Le mot de passe et l'email ne sont demandés qu'à la création.
export function userSchema(isEdit: boolean) {
  return z.object({
    firstName: requiredText("Le prénom"),
    lastName: requiredText("Le nom"),
    email: isEdit ? z.string().optional() : z.string().trim().min(1, "L'email est requis").email("Email invalide"),
    password: isEdit ? z.string().optional() : passwordComplexity,
    phone: z.string().trim().max(50).optional().or(z.literal("")),
    company: z.string().trim().max(200).optional().or(z.literal("")),
    site: z.string().trim().max(200).optional().or(z.literal("")),
    isActive: z.boolean(),
  });
}
export type UserForm = z.infer<ReturnType<typeof userSchema>>;

export const timelineEventSchema = z.object({
  type: z.enum(["DETECTION", "ACTION", "DECISION", "COMMUNICATION", "ESCALATION", "RESOLUTION"]),
  title: requiredText("Le titre"),
  description: z.string().max(2000),
  occurredAt: z.string().min(1, "La date est requise"),
  isFirstDetection: z.boolean(),
  ipAddress: z.string().max(64),
  assetName: z.string().max(200),
  affectedUser: z.string().max(200),
  ioc: z.string().max(500),
});
export type TimelineEventForm = z.infer<typeof timelineEventSchema>;
