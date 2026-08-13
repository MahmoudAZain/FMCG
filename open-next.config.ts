import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Cloudflare Workers adapter configuration.
 *
 * Deliberately minimal: no incremental cache, no tag cache, no queue. Those
 * bindings cost money beyond the free tier, and research R1 rules incremental
 * static regeneration out of v1. Pages are server-rendered per request, which
 * the Workers free allowance (100k requests/day) covers with wide headroom at
 * the planned volume.
 */
export default defineCloudflareConfig();
