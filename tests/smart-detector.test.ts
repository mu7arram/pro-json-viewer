import { describe, it, expect } from 'vitest';
import { detectSmartValue, extractRawJsonFromDocument } from '../src/engine/smart-detector';

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

  describe('extractRawJsonFromDocument', () => {
    it('detects raw JSON API response with application/json header', () => {
      const mockDoc = {
        contentType: 'application/json',
        body: {
          children: [{ tagName: 'PRE' }],
          firstElementChild: { tagName: 'PRE' },
          textContent: '{"name": "React", "stars": 200000}',
          querySelector: (selector: string) => {
            if (selector.includes('pre')) return { textContent: '{"name": "React", "stars": 200000}' };
            return null;
          }
        },
        querySelector: () => null
      } as unknown as Document;

      const mockLoc = { pathname: '/users/react/repos' } as Location;
      const res = extractRawJsonFromDocument(mockDoc, mockLoc);
      expect(res).toBe('{"name": "React", "stars": 200000}');
    });

    it('detects Chrome native JSON viewer with div#json or extra elements in body', () => {
      const mockDoc = {
        contentType: 'application/json',
        body: {
          children: [{ tagName: 'DIV' }, { tagName: 'STYLE' }, { tagName: 'PRE' }],
          firstElementChild: { tagName: 'DIV' },
          textContent: '{"status": "ok", "items": [1, 2]}',
          querySelector: (selector: string) => {
            if (selector.includes('div#json')) return { textContent: '{"status": "ok", "items": [1, 2]}' };
            if (selector.includes('pre')) return { textContent: '{"status": "ok", "items": [1, 2]}' };
            return null;
          }
        },
        querySelector: () => null
      } as unknown as Document;

      const mockLoc = { pathname: '/api/v1/health' } as Location;
      const res = extractRawJsonFromDocument(mockDoc, mockLoc);
      expect(res).toBe('{"status": "ok", "items": [1, 2]}');
    });

    it('detects local or remote .json file', () => {
      const mockDoc = {
        contentType: 'text/plain',
        body: {
          children: [{ tagName: 'PRE' }],
          firstElementChild: { tagName: 'PRE' },
          textContent: '[1, 2, 3, 4]'
        },
        querySelector: () => null
      } as unknown as Document;

      const mockLoc = { pathname: '/configs/settings.json' } as Location;
      const res = extractRawJsonFromDocument(mockDoc, mockLoc);
      expect(res).toBe('[1, 2, 3, 4]');
    });

    it('does NOT activate on regular HTML websites like jsonformatter.org with nested pre tags', () => {
      const mockDoc = {
        contentType: 'text/html',
        body: {
          children: [
            { tagName: 'HEADER' },
            { tagName: 'NAV' },
            { tagName: 'DIV' },
            { tagName: 'FOOTER' }
          ],
          firstElementChild: { tagName: 'HEADER' },
          textContent: 'JSON Formatter & Validator tool with code: {"test": 123}'
        },
        querySelector: (selector: string) => {
          if (selector.includes('nav') || selector.includes('header') || selector.includes('button')) {
            return { tagName: 'NAV' };
          }
          return null;
        }
      } as unknown as Document;

      const mockLoc = { pathname: '/' } as Location;
      const res = extractRawJsonFromDocument(mockDoc, mockLoc);
      expect(res).toBeNull();
    });

    it('does NOT activate on HTML pages with multiple body children and no JSON header', () => {
      const mockDoc = {
        contentType: 'text/html',
        body: {
          children: [{ tagName: 'DIV' }, { tagName: 'PRE' }],
          firstElementChild: { tagName: 'DIV' },
          textContent: '{"foo": "bar"}'
        },
        querySelector: () => null
      } as unknown as Document;

      const mockLoc = { pathname: '/docs/api' } as Location;
      const res = extractRawJsonFromDocument(mockDoc, mockLoc);
      expect(res).toBeNull();
    });
  });
});