/** Emails são armazenados e comparados sempre em minúsculas, sem espaços nas bordas. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
