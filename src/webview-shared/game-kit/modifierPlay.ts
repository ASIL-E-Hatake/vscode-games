// ランダム縛りプレイの game-kit 側の処理: ルール説明の「ランダム縛りで遊ぶ」と縛りごとの最高記録・
// スタートのたびの縛りの抽選・カウントダウン前の表示。純粋なロジックは src/core/modifiers.ts。
// 記録の保存は game-kit の submitScore（modifier 付き）が行う。docs/08-keep-playing.md 5 章
import { modifierRecordRows, pickModifier, type ModifierOption } from '../../core/modifiers';
import { bridge } from '../bridge';
import { h } from '../dom';
import { modifierStrings as s } from './strings';

/** GameDefinition.modifiers。ゲームが定義する縛り（追加ルール） */
export interface GameModifiers {
  /** 縛りの一覧（ID は feature.ts の score.modifiers と同じにする） */
  options: ModifierOption[];
  /** 縛りを選べるモード・レベルか（省略時はすべて。苦手復習・問題パックなど記録を分けられないモードは false にする） */
  appliesTo?(mode: string | undefined, level: string | undefined): boolean;
}

const ENABLED_KEY = 'modifier-enabled';

/** 1 回の runGame で 1 つ作る */
export class ModifierSession {
  enabled = false;
  /** 今のプレイの縛り（縛りなしのプレイは undefined。結果画面まで残る） */
  current: ModifierOption | undefined;
  private lastId: string | undefined;

  constructor(
    readonly def: GameModifiers | undefined,
    private readonly random: () => number = Math.random,
  ) {}

  /** 保存されている「縛りで遊ぶ」のオン / オフを読む */
  async load(): Promise<void> {
    if (!this.def) return;
    const saved = await bridge.load<boolean>(ENABLED_KEY).catch(() => undefined);
    if (typeof saved === 'boolean') this.enabled = saved;
  }

  /** このモード・レベルで縛りを選べるか */
  available(mode: string | undefined, level: string | undefined): boolean {
    return this.def !== undefined && (this.def.appliesTo?.(mode, level) ?? true);
  }

  /** このプレイを縛りで遊ぶか（日替わりチャレンジとは同時に使わない） */
  active(mode: string | undefined, level: string | undefined, daily: boolean): boolean {
    return this.enabled && !daily && this.available(mode, level);
  }

  /** プレイを始める（カウントダウンの前）。縛りで遊ぶなら 1 つ決める（直前と同じ縛りは続けない） */
  newPlay(active: boolean): ModifierOption | undefined {
    this.current =
      active && this.def ? pickModifier(this.def.options, this.random, this.lastId) : undefined;
    if (this.current) this.lastId = this.current.id;
    return this.current;
  }

  /** ルール説明に置くチェック・説明・縛りごとの最高記録（選べないときは null） */
  intro(input: {
    mode: string | undefined;
    level: string | undefined;
    recordMode: string | undefined;
    records: Record<string, { best?: number; playCount: number }> | undefined;
    formatScore(score: number): string;
    onChange(): void;
  }): HTMLElement | null {
    const def = this.def;
    if (!def || !this.available(input.mode, input.level)) return null;
    const input_ = h('input', { type: 'checkbox', 'data-testid': 'game-modifier-toggle' });
    input_.checked = this.enabled;
    input_.addEventListener('change', () => {
      this.enabled = input_.checked;
      bridge.save(ENABLED_KEY, this.enabled);
      input.onChange();
    });
    const rows = modifierRecordRows(def.options, input.recordMode, input.records);
    return h(
      'div',
      { class: 'modifier-toggle', 'data-testid': 'game-modifier-intro' },
      h(
        'p',
        { class: 'ghost-toggle' },
        h('label', {}, input_, s.toggle),
        h('span', { class: 'muted' }, s.toggleHint),
      ),
      this.enabled
        ? h(
            'ul',
            { class: 'modifier-rules muted', 'aria-label': s.toggle },
            ...def.options.map((o) => h('li', {}, `${o.label}: ${o.rule}`)),
          )
        : null,
      h(
        'details',
        { class: 'modifier-records' },
        h('summary', {}, s.recordsTitle),
        h(
          'ul',
          { 'data-testid': 'game-modifier-records' },
          ...rows.map((r) =>
            h(
              'li',
              {},
              r.best === undefined
                ? s.noRecord(r.label)
                : s.recordRow(r.label, input.formatScore(r.best), r.playCount),
            ),
          ),
        ),
        h('p', { class: 'muted' }, s.separate),
      ),
    );
  }

  /** カウントダウンの前に見せる、今回の縛り（縛りなしは null） */
  banner(): HTMLElement | null {
    const m = this.current;
    if (!m) return null;
    return h(
      'div',
      { class: 'modifier-banner', 'data-testid': 'game-modifier-banner' },
      h('strong', {}, s.banner(m.label)),
      h('span', {}, m.rule),
    );
  }

  /** プレイ中に見せる小さな表示（縛りなしは空） */
  badgeText(): string {
    return this.current ? `${s.badge(this.current.label)}（${this.current.rule}）` : '';
  }
}
