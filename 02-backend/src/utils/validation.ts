import { z } from 'zod';

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
