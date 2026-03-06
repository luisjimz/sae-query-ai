const BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "EXECUTE",
  "GRANT",
  "REVOKE",
  "MERGE",
  "CALL",
];

export function isSafeQuery(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith("SELECT")) return false;
  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) return false;
  }
  return true;
}
