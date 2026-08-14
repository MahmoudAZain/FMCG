import { z } from 'zod';
import { tryNormalizePhone } from '@/lib/phone';

/**
 * Zod schemas shared between the browser and the server.
 *
 * Client-side validation is a courtesy that saves a round trip. The server runs
 * every one of these again, and the database repeats the ones that protect
 * money or integrity. **A rule that exists only in the browser does not exist.**
 *
 * Note what is absent: there is no schema anywhere in this file for a price, a
 * discount, a delivery fee or a total. No action accepts one from a client
 * (FR-026), so there is nothing to validate.
 */

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max));

export const fullNameSchema = trimmed(2, 120);

/**
 * Accepts any notation an Egyptian writes and stores the canonical form, so the
 * value that reaches the database is already normalized (FR-009, FR-010).
 */
export const phoneSchema = z
  .string()
  .transform((value) => tryNormalizePhone(value))
  .refine((value): value is string => value !== null, { error: 'errors.phoneInvalid' });

/**
 * At least one letter and one digit. Deliberately not a symbol-and-case maze:
 * complexity rules that people cannot satisfy produce passwords on sticky notes,
 * and there is no self-service reset here to rescue them (FR-013).
 */
export const passwordSchema = z
  .string()
  .min(8, { error: 'errors.passwordTooShort' })
  .refine((v) => /[a-zA-Z؀-ۿ]/.test(v) && /[0-9]/.test(v), {
    error: 'errors.passwordNeedsLetterAndDigit',
  });

export const streetAddressSchema = trimmed(5, 300);

/**
 * Required, and the most operationally important field in the system: drivers
 * cannot find Egyptian addresses without one (FR-007).
 */
export const landmarkSchema = trimmed(3, 200);

export const localeSchema = z.enum(['ar', 'en']);

export const addressFieldsSchema = z.object({
  governorate_id: z.uuid(),
  street_address: streetAddressSchema,
  landmark: landmarkSchema,
  building: z.string().max(60).optional().or(z.literal('')),
  floor_apartment: z.string().max(60).optional().or(z.literal('')),
});

export const registerSchema = z
  .object({
    full_name: fullNameSchema,
    phone: phoneSchema,
    password: passwordSchema,
    locale: localeSchema.default('ar'),
  })
  .and(addressFieldsSchema);

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, { error: 'errors.passwordRequired' }),
});

/**
 * A cart line as it leaves the browser. Identifiers and quantities — nothing
 * else. There is no field here through which a price could travel (FR-024).
 */
export const cartItemSchema = z.object({
  product_id: z.uuid(),
  qty: z.number().int().min(1).max(999),
});

export const cartSchema = z.array(cartItemSchema).min(1).max(100);

export const previewCartSchema = z.object({
  items: cartSchema,
  governorate_id: z.uuid(),
});

export const placeOrderSchema = z.object({
  items: cartSchema,
  address_id: z.uuid(),
  // Generated when the checkout page mounts, so a double-tap produces one order
  // rather than two (FR-038).
  idempotency_key: z.string().min(8).max(100),
  note: z.string().max(500).optional().or(z.literal('')),
});

export const updateProfileSchema = z.object({
  full_name: fullNameSchema,
  preferred_locale: localeSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddressFields = z.infer<typeof addressFieldsSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
