export function resolveInternalClassifyToken(): string | null {
  return (
    process.env.INTERNAL_CLASSIFY_TOKEN ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    null
  );
}
