/**
 * Egyptian mobile number normalization.
 *
 * This deliberately mirrors the SQL `normalize_phone()` character for character
 * (migration 0008). Two implementations of the same rule is a duplication we
 * accept, because the browser must be able to tell someone their number is
 * malformed without a round trip, while the database must refuse a bad number
 * no matter which client sent it. If you change one, change the other — the
 * unit tests here and the SQL tests both assert the same table of cases.
 *
 * Egyptians write their number every possible way: 01001234567, +201001234567,
 * 0020 100 123 4567, 010-0123-4567. All of them are the same person, and
 * without this they would register several times over and split their own order
 * history (FR-009, FR-011).
 */

/** Canonical form: +20, then 1, then the operator digit, then 8 more. */
const CANONICAL = /^\+201[0-25][0-9]{8}$/;

export class InvalidPhoneError extends Error {
  // Written out rather than declared as a constructor parameter property, so
  // this module loads under Node's type-stripping mode. The parity script
  // (scripts/test-phone-parity.sh) imports it directly to compare against the
  // SQL implementation.
  readonly input: string;

  constructor(input: string) {
    super('invalid_phone');
    this.name = 'InvalidPhoneError';
    this.input = input;
  }
}

/**
 * Returns the canonical `+201XXXXXXXXX` form, or throws `InvalidPhoneError`.
 *
 * Egyptian mobile prefixes are 010 (Vodafone), 011 (Etisalat), 012 (Orange) and
 * 015 (WE) — hence the `[0-25]` operator digit.
 */
export function normalizePhone(input: string | null | undefined): string {
  if (input == null) throw new InvalidPhoneError(String(input));

  // Strip everything that is not a digit: spaces, dashes, parentheses, the
  // leading plus.
  let digits = input.replace(/[^0-9]/g, '');

  if (/^0020/.test(digits)) {
    digits = digits.slice(4); // international access code
  } else if (/^20/.test(digits) && digits.length === 12) {
    digits = digits.slice(2); // country code without the plus
  } else if (/^0/.test(digits) && digits.length === 11) {
    digits = digits.slice(1); // local form
  }

  const canonical = `+20${digits}`;
  if (!CANONICAL.test(canonical)) throw new InvalidPhoneError(input);

  return canonical;
}

/** Non-throwing variant, for form validation. */
export function tryNormalizePhone(input: string | null | undefined): string | null {
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}

export function isValidEgyptianMobile(input: string | null | undefined): boolean {
  return tryNormalizePhone(input) !== null;
}

/**
 * The synthetic identifier Supabase Auth keys on.
 *
 * A reserved, non-routable domain — nothing is ever sent to it, and it is never
 * shown to anyone. The business identity is `profiles.phone` (research R2).
 */
export function phoneToAuthIdentifier(phone: string): string {
  return `${normalizePhone(phone).slice(1)}@phone.elgomala.local`;
}

/** Display form: `0100 123 4567`, how an Egyptian would read it aloud. */
export function formatPhoneForDisplay(phone: string): string {
  const canonical = tryNormalizePhone(phone);
  if (!canonical) return phone;

  const local = `0${canonical.slice(3)}`; // +201001234567 → 01001234567
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
