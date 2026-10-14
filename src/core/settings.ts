import * as vscode from 'vscode';
import type { UserSettings } from './messages';
import type { MenuFilter } from './registry';

const SECTION = 'hatake-gottani';

export function readUserSettings(): UserSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return { soundEnabled: config.get<boolean>('sound.enabled', false) };
}

export function readMenuFilter(): MenuFilter {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    audience: config.get<MenuFilter['audience']>('audience', 'all'),
    gamesEnabled: config.get<boolean>('games.enabled', true),
  };
}
