import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env';

/**
 * Supabase client for Client Components.
 *
 * The anon key is public by design — Row Level Security is the boundary, not
 * secrecy. Anything this client can read, a policy has decided it may read.
 */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
