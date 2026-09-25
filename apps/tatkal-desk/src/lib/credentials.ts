/**
 * IRCTC credentials — local only, never sent to any LLM or third-party agent.
 *
 * Preferred (Astra-faithful): leave password empty; type it yourself in the
 * browser during HAND TO ME login takeover.
 *
 * Optional: set IRCTC_USERNAME (hint) and/or IRCTC_PASSWORD in `.env.local`
 * for local Playwright scaffolding that types username only — password still
 * should be entered by you in takeover when possible.
 */

export interface IrctcCredentials {
  username: string;
  password: string | null;
}

export function getIrctcCredentials(): IrctcCredentials | null {
  const username = process.env.IRCTC_USERNAME?.trim();
  if (!username) return null;
  const password = process.env.IRCTC_PASSWORD?.trim() || null;
  return { username, password };
}

export function getCredentialStatus() {
  const creds = getIrctcCredentials();
  if (!creds) {
    return {
      configured: false as const,
      usernameHint: null,
      source: "missing" as const,
      attendedLogin: true as const,
    };
  }
  const u = creds.username;
  const hint =
    u.length <= 2
      ? "***"
      : `${u.slice(0, 2)}${"*".repeat(Math.min(6, u.length - 2))}`;
  return {
    configured: true as const,
    usernameHint: hint,
    source: "env" as const,
    attendedLogin: true as const,
  };
}

/** Arming does not require a password — login is HAND TO ME. */
export function canArmWithoutPassword(): boolean {
  return true;
}
