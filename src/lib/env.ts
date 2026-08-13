import { z } from 'zod';

/**
 * Environment validation. Fails at startup with a readable message rather than
 * at the first database call with a confusing one.
 *
 * The split matters: `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security,
 * so it is read only through `serverEnv()`, which is never reachable from a
 * client component. If that key ever entered a client bundle, every policy in
 * the system would be void (FR-066).
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, { error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' }),
  NEXT_PUBLIC_SITE_URL: z.url({ error: 'NEXT_PUBLIC_SITE_URL must be a valid URL' }),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server' }),
  CRON_SECRET: z.string().min(16, {
    error: 'CRON_SECRET must be at least 16 characters — it guards the scheduled endpoints',
  }),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema> & ClientEnv;

function fail(scope: string, error: z.ZodError): never {
  const detail = error.issues.map((i) => `  · ${i.message}`).join('\n');
  throw new Error(`Invalid ${scope} environment:\n${detail}\n\nSee .env.example.`);
}

/** Public configuration. Safe in the browser — RLS is the security boundary. */
export function clientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) fail('client', parsed.error);
  return parsed.data;
}

/**
 * Server-only configuration, including the service-role key.
 *
 * Throws if called in the browser. That check is a backstop: the real guard is
 * that the only module importing this is `lib/supabase/service.ts`, which
 * carries a `server-only` import.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. This would leak the service-role key.');
  }
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!parsed.success) fail('server', parsed.error);
  return { ...parsed.data, ...clientEnv() };
}
