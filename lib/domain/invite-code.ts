const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Generates a stable, human-readable code from a seed. Ambiguous characters
 * (0/O and 1/I) are excluded. A deterministic suffix resolves collisions.
 */
export function generateInviteCode(seed: string, existingCodes: Iterable<string> = []): string {
  const existing = new Set(Array.from(existingCodes, (code) => code.toUpperCase()));

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let value = fnv1a(`${seed}:${attempt}`);
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += ALPHABET[value % ALPHABET.length];
      value = Math.floor(value / ALPHABET.length) ^ (value << 7);
      value >>>= 0;
    }
    if (!existing.has(code)) return code;
  }

  throw new Error("无法生成唯一邀请码");
}
