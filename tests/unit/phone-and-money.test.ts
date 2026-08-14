import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  tryNormalizePhone,
  phoneToAuthIdentifier,
  formatPhoneForDisplay,
  InvalidPhoneError,
} from '@/lib/phone';
import {
  formatMoney,
  formatAmount,
  discountPercent,
  poundsToPiastres,
  piastresToPounds,
} from '@/lib/money';

describe('phone normalization', () => {
  // The whole point: one person, one account, however they type their number
  // (FR-009, FR-011). These cases mirror the SQL test table exactly.
  const sameNumber = [
    '01001234567',
    '+201001234567',
    '00201001234567',
    '201001234567',
    '0100 123 4567',
    '010-0123-4567',
    '(010) 0123 4567',
    ' 01001234567 ',
  ];

  it.each(sameNumber)('normalizes %s to the canonical form', (input) => {
    expect(normalizePhone(input)).toBe('+201001234567');
  });

  it('treats every notation as the same person', () => {
    const normalized = new Set(sameNumber.map((n) => normalizePhone(n)));
    expect(normalized.size).toBe(1);
  });

  it.each(['010', '011', '012', '015'])('accepts the %s operator prefix', (prefix) => {
    expect(normalizePhone(`${prefix}01234567`)).toBe(`+2${prefix}01234567`);
  });

  it.each([
    ['013 — not an Egyptian mobile prefix', '01301234567'],
    ['014 — not an Egyptian mobile prefix', '01401234567'],
    ['a landline', '0221234567'],
    ['too short', '0100123456'],
    ['too long', '010012345678'],
    ['empty', ''],
    ['letters', 'not a phone'],
    ['a non-Egyptian number', '+447700900000'],
  ])('rejects %s', (_label, input) => {
    expect(() => normalizePhone(input)).toThrow(InvalidPhoneError);
    expect(tryNormalizePhone(input)).toBeNull();
  });

  it('rejects null and undefined without throwing the wrong error', () => {
    expect(tryNormalizePhone(null)).toBeNull();
    expect(tryNormalizePhone(undefined)).toBeNull();
  });

  it('derives a non-routable auth identifier that is never shown to anyone', () => {
    expect(phoneToAuthIdentifier('01001234567')).toBe('201001234567@phone.elgomala.local');
  });

  it('displays a number the way an Egyptian reads it aloud', () => {
    expect(formatPhoneForDisplay('+201001234567')).toBe('0100 123 4567');
  });
});

describe('money formatting', () => {
  it('renders piastres as pounds in English', () => {
    // 4500 piastres is 45.00 EGP — the division happens once, here.
    expect(formatAmount(4500, 'en')).toBe('45.00');
    expect(formatMoney(4500, 'en')).toContain('45.00');
  });

  it('renders Arabic amounts without throwing', () => {
    const arabic = formatMoney(4500, 'ar');
    expect(arabic.length).toBeGreaterThan(0);
    expect(formatAmount(4500, 'ar')).toMatch(/[٤4]/);
  });

  it('keeps two decimal places for whole pounds', () => {
    expect(formatAmount(10000, 'en')).toBe('100.00');
  });

  it('formats a single piastre without losing it', () => {
    expect(formatAmount(1, 'en')).toBe('0.01');
  });

  it('rounds a discount percentage down so the badge never overstates', () => {
    expect(discountPercent(1000, 800)).toBe(20);
    expect(discountPercent(1000, 670)).toBe(33);
    // 999 → 334 is 66.56%, which must show as 66, not 67.
    expect(discountPercent(999, 334)).toBe(66);
  });

  it('reports no discount when the price is unchanged or higher', () => {
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(1000, 1200)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });

  it('parses admin pound input into integer piastres', () => {
    expect(poundsToPiastres('45.50')).toBe(4550);
    expect(poundsToPiastres('45')).toBe(4500);
    expect(poundsToPiastres('0.01')).toBe(1);
    expect(poundsToPiastres('1,234.56')).toBe(123456);
  });

  it('refuses admin input that is not a clean amount', () => {
    expect(poundsToPiastres('45.555')).toBeNull();
    expect(poundsToPiastres('abc')).toBeNull();
    expect(poundsToPiastres('-45')).toBeNull();
    expect(poundsToPiastres('')).toBeNull();
  });

  it('round-trips an admin amount without drift', () => {
    for (const piastres of [1, 45, 4500, 4550, 123456, 999999]) {
      expect(poundsToPiastres(piastresToPounds(piastres))).toBe(piastres);
    }
  });
});
