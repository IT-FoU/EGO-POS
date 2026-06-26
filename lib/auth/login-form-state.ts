export function canSubmitLoginCredentials(username: string, secret: string) {
  return Boolean(username.trim() && secret.length > 0);
}

export function readLoginCredentialsFromForm(
  form: HTMLFormElement,
  options?: { secretFieldName?: string; usernameFieldName?: string },
) {
  const formData = new FormData(form);
  const usernameFieldName = options?.usernameFieldName ?? "username";
  const secretFieldName = options?.secretFieldName ?? "password";
  const username = String(formData.get(usernameFieldName) ?? "").trim();
  const secret = String(formData.get(secretFieldName) ?? "");
  return { secret, username };
}
