import { describe, it, expect } from 'vitest';
import { routing, directionOf, formattingLocale } from '@/i18n/routing';

describe('locale routing', () => {
  it('defaults to Arabic', () => {
    expect(routing.defaultLocale).toBe('ar');
  });

  it('supports exactly Arabic and English', () => {
    expect([...routing.locales].sort()).toEqual(['ar', 'en']);
  });

  it('renders Arabic right-to-left and English left-to-right', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });

  it('formats for Egypt in both languages', () => {
    expect(formattingLocale('ar')).toBe('ar-EG');
    expect(formattingLocale('en')).toBe('en-EG');
  });
});

describe('message catalogues', () => {
  it('define the same keys in both languages', async () => {
    const ar = (await import('@/i18n/messages/ar.json')).default;
    const en = (await import('@/i18n/messages/en.json')).default;

    const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        value !== null && typeof value === 'object'
          ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );

    // Constitution Principle III: English is a first-class alternate, not a
    // fallback. A key present in one language and missing in the other renders
    // an empty region for half the customers.
    expect(flatten(ar).sort()).toEqual(flatten(en).sort());
  });
});
