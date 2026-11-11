// Supabase errors are plain objects, not Errors: String() on one gives
// "[object Object]"
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null | undefined)?.message
  return typeof message === 'string' ? message : String(error)
}
