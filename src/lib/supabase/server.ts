import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { clientEnv } from '@/lib/env';

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 *
 * Uses the anon key and the caller's session. Row Level Security is therefore
 * in force on everything it touches — which is the point. Reach for the
 * service-role client only where a deliberate, reviewed privileged operation
 * genuinely needs it.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = clientEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Session refresh happens in
          // middleware, so ignoring this is correct rather than merely tolerable.
        }
      },
    },
  });
}
