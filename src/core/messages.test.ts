import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from './messages';

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
