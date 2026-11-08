import { describe, expect, it } from 'vitest';
import { validateNickname } from '../../src/online/nickname';

describe('validateNickname', () => {
  it('accepts a normal nickname', () => {
    expect(validateNickname('Rafi')).toBeNull();
  });

  it('rejects a nickname shorter than 2 characters', () => {
    expect(validateNickname('R')).toBe('tooShort');
  });

  it('rejects a nickname longer than 16 characters', () => {
    expect(validateNickname('a'.repeat(17))).toBe('tooLong');
  });

  it('trims whitespace before checking length', () => {
    expect(validateNickname('  R  ')).toBe('tooShort');
    expect(validateNickname('  Rafi  ')).toBeNull();
  });

  it('rejects a blocklisted word regardless of case', () => {
    expect(validateNickname('BiTcH')).toBe('blocked');
  });
});
