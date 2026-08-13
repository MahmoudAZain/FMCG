import type { ReactNode } from 'react';

/**
 * Root layout. Deliberately thin — `lang` and `dir` are set by the locale
 * layout, which is the only place that knows the active locale. Next requires
 * a root layout to exist even when every route lives under `[locale]`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
