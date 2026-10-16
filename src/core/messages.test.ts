import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, isValidTermId } from './messages';

describe('isAllowedExternalUrl', () => {
  it.each(['https://example.com', 'http://example.com/path?q=1'])('許可: %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'vscode://settings',
    'command:workbench.action.reloadWindow',
    'not a url',
    '',
  ])('拒否: "%s"', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});

describe('isValidTermId', () => {
  it.each(['variable', 'null', 'pull-request', 'f-string2'])('許可: %s', (id) => {
    expect(isValidTermId(id)).toBe(true);
  });

  it.each(['', 'Variable', 'a--b', '-a', 'a b', '../x', 'a'.repeat(65), 1, null])(
    '拒否: "%s"',
    (id) => {
      expect(isValidTermId(id)).toBe(false);
    },
  );
});
