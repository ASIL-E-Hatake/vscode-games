// 機能の登録リスト。新しい機能はここに 1 行ずつ追加する（アルファベット順）。
// src/features/ 配下のフォルダがすべて登録されているかはユニットテストで検査している。
import type { FeatureDefinition } from '../core/feature';
import { feature as home } from './home/feature';
import { feature as links } from './links/feature';

export const features: FeatureDefinition[] = [home, links];
