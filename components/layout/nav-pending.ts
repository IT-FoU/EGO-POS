export function hrefMatchesPath(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return href !== "#" && pathname.startsWith(href);
}

export function navVisualState(href: string, pathname: string, pendingHref: string | null) {
  const isCurrent = hrefMatchesPath(href, pathname);
  const isPending = pendingHref === href && !isCurrent;
  const isActive = pendingHref ? pendingHref === href : isCurrent;
  return { isActive, isCurrent, isPending };
}

export function shouldMarkPendingNavigation(event: {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return false;
  return href !== "#";
}
