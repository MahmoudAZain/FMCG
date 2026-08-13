/**
 * Next 15's bundled types declare `*.module.css` but not plain global CSS, and
 * TypeScript 6 turns an unresolved side-effect import into an error (TS2882).
 * `import './globals.css'` in the locale layout is the standard App Router
 * pattern, so declare the module rather than weaken the compiler settings.
 */
declare module '*.css';
