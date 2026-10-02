export const STAFF_NAME_MAX_LENGTH = 120;
export const STAFF_USERNAME_MAX_LENGTH = 64;
export const STAFF_PASSWORD_MIN_LENGTH = 8;
export const STAFF_PASSWORD_MAX_LENGTH = 72;

export function isProtectedOwnerRole(role: { name?: string | null; templateKey?: string | null } | null | undefined) {
  const templateKey = String(role?.templateKey ?? "").trim().toLowerCase();
  const name = String(role?.name ?? "").trim().toLowerCase();
  return templateKey === "owner" || name === "owner";
}

export function isAssignableStaffRole(role: { name?: string | null; templateKey?: string | null } | null | undefined) {
  return !isProtectedOwnerRole(role);
}

export function normalizeStaffName(value: string) {
  return value.trim();
}

export function normalizeStaffUsername(value: string) {
  return value.trim();
}

export function validateStaffAccountInput(input: {
  fullName: string;
  password?: string;
  passwordRequired?: boolean;
  username: string;
}) {
  const fullName = normalizeStaffName(input.fullName);
  const username = normalizeStaffUsername(input.username);
  const password = input.password?.trim() ?? "";

  if (!fullName || !username) {
    throw new Error("Staff name, username, branch, and role are required.");
  }
  if (fullName.length > STAFF_NAME_MAX_LENGTH) {
    throw new Error("Name is too long.");
  }
  if (/\s/u.test(username)) {
    throw new Error("Username cannot contain spaces.");
  }
  if (username.length > STAFF_USERNAME_MAX_LENGTH) {
    throw new Error("Username is too long.");
  }
  if (input.passwordRequired && !password) {
    throw new Error("Password is required for new staff.");
  }
  if (password && password.length < STAFF_PASSWORD_MIN_LENGTH) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (password.length > STAFF_PASSWORD_MAX_LENGTH) {
    throw new Error("Password is too long.");
  }

  return { fullName, password: password || undefined, username };
}
