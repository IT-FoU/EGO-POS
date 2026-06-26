/** MVP-visible store/platform login entry points (promoted in UX and docs). */
export const MVP_VISIBLE_LOGIN_PORTALS = ["/login", "/super-admin/login"] as const;

/** Retained for future setup staff; not promoted in MVP navigation. */
export const MVP_DEFERRED_LOGIN_PORTALS = ["/ego-admin/login"] as const;

export function isMvpVisibleLoginPortal(path: string) {
  return (MVP_VISIBLE_LOGIN_PORTALS as readonly string[]).includes(path);
}
