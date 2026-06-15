// What to call a member in the UI. Prefer their chosen display name; if they
// haven't set one yet, fall back to the local-part of their signup email
// (e.g. "jordanreticker@gmail.com" → "jordanreticker") rather than a bare
// "(no name yet)". Only the local-part is ever shown — never the domain.
export function memberName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = displayName?.trim();
  if (name) return name;
  const local = email?.split('@')[0]?.trim();
  if (local) return local;
  return '(no name yet)';
}
