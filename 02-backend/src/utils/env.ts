import { z } from 'zod';

/**
 * F4 — Validation des variables d'environnement au démarrage.
 * Vérifie l'existence ET le format ; arrête le process (exit 1) si invalide.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL doit être une URL valide'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET doit faire au moins 16 caractères'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET doit faire au moins 16 caractères'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[startup] Configuration d\'environnement invalide :');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
