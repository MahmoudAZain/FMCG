import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Using these instead of `next/link` and
 * `next/navigation` keeps the active locale on every internal link, so a
 * customer browsing in Arabic never lands on an English page by accident.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
