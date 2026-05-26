const KEY = "fanben_uid";

export function getClientUserId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setClientUserId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
}

