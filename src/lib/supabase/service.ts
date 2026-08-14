import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Service-role client. **Bypasses every Row Level Security policy.**
 *
 * Three things keep this contained:
 *
 *   1. `server-only` above — importing it from a Client Component fails the
 *      build rather than shipping the key to a browser (FR-066).
 *   2. An ESLint rule makes importing this module an error everywhere except
 *      here, so reaching for it is a deliberate act.
 *   3. `serverEnv()` throws if it is somehow evaluated in a browser.
 *
 * Legitimate uses are narrow: creating an auth user during registration, the
 * staff-mediated password reset (FR-016), and the scheduled jobs. Everything a
 * signed-in user does should go through the server client, where the policies
 * still apply.
 */
export function createServiceClient() {
  const env = serverEnv();

  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // No session to persist or refresh: this client acts as the system, never
      // as a person.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
