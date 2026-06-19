import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS)
}

export async function comparePassword(plainText: string, hashed: string): Promise<boolean> {
  // If the stored password is NOT hashed (legacy), compare directly and return true
  // so we can migrate on next login
  if (!plainText || !hashed) return false
  if (hashed.startsWith('$2') && (hashed.startsWith('$2a$') || hashed.startsWith('$2b$'))) {
    return bcrypt.compare(plainText, hashed)
  }
  // Legacy plain-text comparison
  return plainText === hashed
}

export function isHashed(password: string): boolean {
  return password.startsWith('$2a$') || password.startsWith('$2b$')
}
