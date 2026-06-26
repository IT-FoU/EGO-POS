export const PIN_NOT_ALLOWED_MESSAGE = "PIN login is not supported for this portal.";

export function isPinOnlySecret(secret: string) {
  return /^\d{4,8}$/.test(secret.trim());
}

export function isEmailIdentifier(identifier: string) {
  return identifier.trim().includes("@");
}
