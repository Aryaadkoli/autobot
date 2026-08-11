import { parsePhoneNumberWithError } from "libphonenumber-js";

// Normalizes to E.164, defaulting to India (+91) when no country code is given.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = parsePhoneNumberWithError(trimmed, "IN");
    return parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
