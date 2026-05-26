export function getErrorMessage(e: unknown, fallback = "发生错误") {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  return fallback;
}

