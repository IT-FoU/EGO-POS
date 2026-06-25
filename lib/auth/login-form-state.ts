export function canSubmitLoginCredentials(username: string, secret: string) {
  return Boolean(username.trim() && secret.length > 0);
}

export function readLoginCredentialsFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);
  const username = String(formData.get("username") ?? "").trim();
  const secret = String(formData.get("password") ?? "");
  return { secret, username };
}
