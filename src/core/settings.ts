import * as vscode from 'vscode';
import type { UserSettings } from './messages';
import type { MenuFilter } from './registry';

const SECTION = 'hatake-gottani';

export function readUserSettings(): UserSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return { soundEnabled: config.get<boolean>('sound.enabled', false) };
}

/** チートシートで表示する ID（hatake-gottani.cheatsheet.languages）。空ならすべて表示 */
export function readCheatsheetLanguages(): string[] {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>('cheatsheet.languages', []);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function readMenuFilter(): MenuFilter {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    audience: config.get<MenuFilter['audience']>('audience', 'all'),
    gamesEnabled: config.get<boolean>('games.enabled', true),
  };
}
