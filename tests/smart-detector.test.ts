import { describe, it, expect } from 'vitest';
import { detectSmartValue } from '../src/engine/smart-detector';

describe('SmartDetector', () => {
  it('detects and decodes JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = detectSmartValue(jwt);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('jwt');
    expect(result?.metadata?.payload?.name).toBe('John Doe');
  });

  it('detects ISO date strings and Unix timestamps', () => {
    const isoDate = '2026-08-20T10:00:00Z';
    const dateResult = detectSmartValue(isoDate);
    expect(dateResult?.type).toBe('date');

    const timestamp = 1770000000;
    const epochResult = detectSmartValue(timestamp);
    expect(epochResult?.type).toBe('date');
  });

  it('detects standard URLs', () => {
    const url = 'https://api.github.com/users/mu7arram';
    const result = detectSmartValue(url);
    expect(result?.type).toBe('url');
  });
});