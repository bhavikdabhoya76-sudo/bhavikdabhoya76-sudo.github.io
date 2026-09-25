/**
 * IRCTC credentials must come from environment — never committed to git.
 *
 * Set in `.env.local`:
 *   IRCTC_USERNAME=your_user
 *   IRCTC_PASSWORD=your_password
 *
 * Optional encryption passphrase for future local vault:
 *   CREDENTIALS_SECRET=long-random-string
 */

export interface IrctcCredentials {
  username: string;
  password: string;
}

export function getIrctcCredentials(): IrctcCredentials | null {
  const username = process.env.IRCTC_USERNAME?.trim();
  const password = process.env.IRCTC_PASSWORD?.trim();
  if (!username || !password) return null;
  return { username, password };
}

export function getCredentialStatus() {
  const creds = getIrctcCredentials();
  if (!creds) {
    return {
      configured: false as const,
      usernameHint: null,
      source: "missing" as const,
    };
  }
  const u = creds.username;
  const hint =
    u.length <= 2 ? "***" : `${u.slice(0, 2)}${"*".repeat(Math.min(6, u.length - 2))}`;
  return {
    configured: true as const,
    usernameHint: hint,
    source: "env" as const,
  };
}
