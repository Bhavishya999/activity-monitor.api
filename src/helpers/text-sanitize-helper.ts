/** PostgreSQL text columns reject NUL (\u0000); git messages and author names can contain it. */
export function stripNul(value: string): string {
  return value.includes("\u0000") ? value.replaceAll("\u0000", "") : value;
}

export function stripNulOrNull(value: string | null): string | null {
  return value === null ? null : stripNul(value);
}
