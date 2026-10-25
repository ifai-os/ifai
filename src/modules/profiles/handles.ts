import { randomBytes } from 'node:crypto'

/**
 * The address IFAI gives a new member (docs/specs/circles.md rule 18): `u-` and ten random hex
 * digits, which members cannot choose themselves (./rules.ts), so it never clashes with a chosen
 * one. Better Auth sets it when the account is created (src/lib/auth/auth.ts).
 */
export function newHandle(): string {
  return `u-${randomBytes(5).toString('hex')}`
}
