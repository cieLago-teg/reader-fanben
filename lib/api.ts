import { getClientUserId, setClientUserId } from "./clientUser";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers);
  const userId = getClientUserId();
  if (userId) headers.set("x-user-id", userId);

  const res = await fetch(input, {
    ...init,
    headers,
  });

  const nextUserId = res.headers.get("x-user-id");
  if (nextUserId) setClientUserId(nextUserId);

  const json = (await res.json()) as ApiResponse<T>;
  return json;
}

