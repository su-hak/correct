import * as crypto from 'crypto';

export function generateSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex');
}