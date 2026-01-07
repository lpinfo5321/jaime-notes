import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Validación LAZY para evitar que `next build` explote si aún no configuraste
 * `.env.local` (o variables en Vercel). Se valida al momento de usar Supabase.
 */
export function tryGetPublicEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return parsed.success ? parsed.data : null;
}

export function getPublicEnv() {
  const env = tryGetPublicEnv();
  if (!env) {
    throw new Error(
      "Faltan variables de entorno de Supabase. Configura `.env.local` con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).",
    );
  }

  return env;
}

