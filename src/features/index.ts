// 機能の登録リスト。新しい機能はここに 1 行ずつ追加する（アルファベット順）。
// src/features/ 配下のフォルダがすべて登録されているかはユニットテストで検査している。
import type { FeatureDefinition } from '../core/feature';
import { feature as cheatsheet } from './cheatsheet/feature';
import { feature as errorDict } from './error-dict/feature';
import { feature as feedback } from './feedback/feature';
import { feature as gameReaction } from './game-reaction/feature';
import { feature as gameShortcutQuiz } from './game-shortcut-quiz/feature';
import { feature as gameSlidePuzzle } from './game-slide-puzzle/feature';
import { feature as gameTyping } from './game-typing/feature';
import { feature as gitDict } from './git-dict/feature';
import { feature as home } from './home/feature';
import { feature as links } from './links/feature';
import { feature as linuxDict } from './linux-dict/feature';
import { feature as vscodeGuide } from './vscode-guide/feature';

export const features: FeatureDefinition[] = [
  cheatsheet,
  errorDict,
  feedback,
  gameReaction,
  gameShortcutQuiz,
  gameSlidePuzzle,
  gameTyping,
  gitDict,
  home,
  links,
  linuxDict,
  vscodeGuide,
];
