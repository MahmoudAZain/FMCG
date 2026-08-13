import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next 15 ships eslintrc-format config, so it needs the compat
// bridge. (Version 16 is flat-config native, but Next 16's proxy runs on
// Node.js only and @opennextjs/cloudflare requires edge middleware — see
// src/middleware.ts.)
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Constitution Principle III: layout must be direction-agnostic.
 *
 * Physical Tailwind utilities silently break right-to-left — `ml-4` pushes an
 * element away from the *left* edge in both directions, which is correct in
 * English and wrong in Arabic. The logical equivalents (`ms-4`, `me-4`,
 * `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`) flip with the
 * writing direction automatically.
 *
 * These are caught by lint rather than by review, because they are invisible
 * until someone opens the site in Arabic.
 */
/** Utilities that take a value: `ml-4`, `left-0`, `border-l-2`. */
const physicalPrefixes = [
  { find: 'ml', use: 'ms' },
  { find: 'mr', use: 'me' },
  { find: 'pl', use: 'ps' },
  { find: 'pr', use: 'pe' },
  { find: 'left', use: 'start' },
  { find: 'right', use: 'end' },
  { find: 'border-l', use: 'border-s' },
  { find: 'border-r', use: 'border-e' },
  { find: 'rounded-l', use: 'rounded-s' },
  { find: 'rounded-r', use: 'rounded-e' },
  { find: 'rounded-tl', use: 'rounded-ss' },
  { find: 'rounded-tr', use: 'rounded-se' },
  { find: 'rounded-bl', use: 'rounded-es' },
  { find: 'rounded-br', use: 'rounded-ee' },
  { find: 'scroll-ml', use: 'scroll-ms' },
  { find: 'scroll-mr', use: 'scroll-me' },
  { find: 'scroll-pl', use: 'scroll-ps' },
  { find: 'scroll-pr', use: 'scroll-pe' },
];

/** Complete utilities with no value: `text-left`, `float-right`. */
const physicalExact = [
  { find: 'text-left', use: 'text-start' },
  { find: 'text-right', use: 'text-end' },
  { find: 'float-left', use: 'float-start' },
  { find: 'float-right', use: 'float-end' },
  { find: 'clear-left', use: 'clear-start' },
  { find: 'clear-right', use: 'clear-end' },
  { find: 'border-l', use: 'border-s' },
  { find: 'border-r', use: 'border-e' },
];

// A utility may be bare, prefixed by a variant (`md:`, `hover:`) or negated
// (`-ml-2`), and is bounded by whitespace or the end of the class string.
const boundary = `(?:^|[\\s"'\`:])-?`;

const rtlPattern = [
  ...physicalPrefixes.map(({ find }) => `${boundary}${find}-(?:\\[|[a-z0-9])`),
  ...physicalExact.map(({ find }) => `${boundary}${find}(?:$|[\\s"'\`])`),
].join('|');

const rtlMessage =
  'Physical utility breaks right-to-left layout (Constitution Principle III). ' +
  'Use the logical equivalent: ml→ms, mr→me, pl→ps, pr→pe, left→start, right→end, ' +
  'text-left→text-start, text-right→text-end, border-l→border-s, border-r→border-e, ' +
  'rounded-l→rounded-s, rounded-r→rounded-e. Full list in eslint.config.mjs.';

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', '.open-next/**', '.wrangler/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${rtlPattern}/]`,
          message: rtlMessage,
        },
        {
          selector: `TemplateElement[value.raw=/${rtlPattern}/]`,
          message: rtlMessage,
        },
      ],
      // Money is integer piastres end to end (research R5). Floating-point
      // arithmetic on money is a cash dispute at the customer's door.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The service-role client is the one module allowed to read privileged
    // configuration. Nothing else may import it (FR-066).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/supabase/service.ts', 'src/lib/env.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/service',
              message:
                'The service-role client bypasses Row Level Security. Use the server or browser client instead, and reach for this only inside a deliberate, reviewed server-side operation.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
