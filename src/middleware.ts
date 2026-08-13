import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Resolves the locale from the cookie, then `Accept-Language`, defaulting to
 * Arabic. A bare `/` redirects to `/ar` (FR-001, FR-004).
 *
 * Admin route protection is deliberately NOT here. Middleware runs before the
 * session is fully resolved and, more importantly, an application-layer check
 * is a usability affordance rather than a security boundary — Row Level
 * Security refuses the data regardless (Constitution Principle II). The admin
 * layout re-checks per request so staff see a clean "not allowed" page instead
 * of an empty one.
 */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, and anything with a file extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
