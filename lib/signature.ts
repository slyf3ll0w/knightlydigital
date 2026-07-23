/**
 * Signature-name matching for client sign-off. The typed signature must be
 * the person the document was made out to — extra middle names or initials
 * are fine ("John A. Smith" signs for "John Smith"), a different name is not.
 * Shared by the public approval page (friendly pre-check) and the public API
 * route (the authoritative check).
 */

function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents so they never block a signature
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // O'Brien / Smith-Jones split into plain words
    .split(/\s+/)
    .filter(Boolean);
}

function compact(name: string): string {
  return tokens(name).join("");
}

export function signatureMatchesName(
  typed: string,
  firstName: string,
  lastName: string
): boolean {
  const fullName = `${firstName} ${lastName}`;
  const expected = tokens(fullName);
  // No usable name on file — any real signature is acceptable
  if (expected.length === 0) return typed.trim().length > 0;
  const typedTokens = tokens(typed);
  return (
    expected.every((t) => typedTokens.includes(t)) ||
    // Punctuation-style rescue: "PatrickOBrien" for "Patrick O'Brien"
    compact(typed) === compact(fullName)
  );
}
