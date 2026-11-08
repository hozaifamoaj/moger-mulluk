// §12.7 step 1 / §13.1: "Nickname with offensive words (simple blocklist on
// the client)." This list is intentionally short and literal — it exists to
// catch obviously offensive submissions before they reach the nickname
// column (which the database only checks for length, §12.7's SQL), not to
// be an exhaustive moderation system.
const BLOCKLIST = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'rape', 'faggot'];

export type NicknameError = 'tooShort' | 'tooLong' | 'blocked';

export function validateNickname(raw: string): NicknameError | null {
  const name = raw.trim();
  if (name.length < 2) return 'tooShort';
  if (name.length > 16) return 'tooLong';

  const lower = name.toLowerCase();
  if (BLOCKLIST.some((word) => lower.includes(word))) return 'blocked';

  return null;
}
