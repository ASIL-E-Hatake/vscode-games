import { describe, expect, it } from 'vitest';
import type { FeatureDefinition } from '../../core/feature';
import type { ScoreRecord } from '../../core/storage';
import { buildHomeData } from './logic';

const f = (over: Partial<FeatureDefinition> & { id: string }): FeatureDefinition => ({
  title: over.id,
  description: `${over.id} の説明`,
  category: 'tool',
  icon: 'tools',
  kind: 'webview',
  ...over,
});

const features = [
  f({ id: 'home', category: 'home' }),
  f({ id: 'linux-dict', category: 'reference', title: 'Linux コマンド辞書' }),
  f({ id: 'cheatsheet', category: 'reference', title: 'チートシート' }),
  f({
    id: 'game-typing',
    category: 'game',
    title: 'コードタイピング',
    playTime: '約1分',
    score: { order: 'higher', unit: ' WPM' },
  }),
  f({
    id: 'game-reaction',
    category: 'game',
    title: '反射神経テスト',
    score: { order: 'lower', unit: ' ms' },
  }),
];

const scores: Record<string, ScoreRecord> = {
  'game-typing': { best: 42, playCount: 3, history: [] },
};

describe('buildHomeData', () => {
  const data = buildHomeData({
    features,
    recentIds: ['game-typing', 'home', 'removed-feature', 'linux-dict'],
    scoreOf: (id) => scores[id],
    tip: { id: 't', category: 'vscode', text: 'Ctrl+P でファイルを開く', keys: 'Ctrl+P' },
  });

  it('ホーム自身を除き、カテゴリごとに並び順を保ってまとめる', () => {
    expect(data.sections.map((s) => [s.label, s.features.map((c) => c.id)])).toEqual([
      ['辞書・チートシート', ['linux-dict', 'cheatsheet']],
      ['ゲーム', ['game-typing', 'game-reaction']],
    ]);
  });

  it('カードにタイトル・説明・プレイ時間を載せる', () => {
    expect(data.sections[1]?.features[0]).toEqual({
      id: 'game-typing',
      title: 'コードタイピング',
      description: 'game-typing の説明',
      playTime: '約1分',
    });
  });

  it('最近使った機能はホーム・存在しない機能を除いて順番どおり', () => {
    expect(data.recent.map((r) => r.id)).toEqual(['game-typing', 'linux-dict']);
  });

  it('自己ベストは記録がある機能だけ、単位付き', () => {
    expect(data.bests).toEqual([
      {
        id: 'game-typing',
        featureId: 'game-typing',
        title: 'コードタイピング',
        best: '42 WPM',
        playCount: 3,
      },
    ]);
  });

  it('モードがあるゲームはモードごとに自己ベストを並べる', () => {
    const puzzle = f({
      id: 'game-slide-puzzle',
      category: 'game',
      title: 'スライドパズル',
      score: {
        order: 'lower',
        unit: ' 秒',
        modes: [
          { id: '3x3', label: '3×3' },
          { id: '4x4', label: '4×4' },
        ],
      },
    });
    const result = buildHomeData({
      features: [puzzle],
      recentIds: [],
      scoreOf: (_id, mode) =>
        mode === '4x4' ? { best: 200, playCount: 1, history: [] } : undefined,
    });
    expect(result.bests).toEqual([
      {
        id: 'game-slide-puzzle:4x4',
        featureId: 'game-slide-puzzle',
        title: 'スライドパズル（4×4）',
        best: '200 秒',
        playCount: 1,
      },
    ]);
  });

  it('legacy のモードはモード導入前の記録（モードなし）を表示する', () => {
    const reaction = f({
      id: 'game-reaction',
      category: 'game',
      title: '反射神経テスト',
      score: {
        order: 'lower',
        unit: ' ms',
        modes: [
          { id: 'normal', label: '通常', legacy: true },
          { id: 'go-nogo', label: 'Go/No-Go' },
        ],
      },
    });
    const result = buildHomeData({
      features: [reaction],
      recentIds: [],
      scoreOf: (_id, mode) =>
        mode === undefined
          ? { best: 231, playCount: 4, history: [] }
          : mode === 'go-nogo'
            ? { best: 480, playCount: 1, history: [] }
            : undefined,
    });
    expect(result.bests.map((b) => [b.id, b.title, b.best])).toEqual([
      ['game-reaction:normal', '反射神経テスト（通常）', '231 ms'],
      ['game-reaction:go-nogo', '反射神経テスト（Go/No-Go）', '480 ms'],
    ]);
  });

  it('group のあるモードは、グループごとに記録のある最後のモード（最も難しい難易度）だけを出す', () => {
    const typing = f({
      id: 'game-typing',
      category: 'game',
      title: 'コードタイピング',
      score: {
        order: 'higher',
        unit: ' WPM',
        modes: [
          { id: 'java-easy', label: 'Java・かんたん', group: 'java' },
          { id: 'java', label: 'Java', group: 'java' },
          { id: 'java-oni', label: 'Java・鬼', group: 'java' },
          { id: 'python-easy', label: 'Python・かんたん', group: 'python' },
          { id: 'python', label: 'Python', group: 'python' },
          { id: 'python-oni', label: 'Python・鬼', group: 'python' },
          { id: 'other', label: 'その他' },
        ],
      },
    });
    const bests: Record<string, number> = {
      'java-easy': 50,
      java: 40,
      'java-oni': 20,
      'python-easy': 30,
      other: 10,
    };
    const result = buildHomeData({
      features: [typing],
      recentIds: [],
      scoreOf: (_id, mode) => {
        const best = mode === undefined ? undefined : bests[mode];
        return best === undefined ? undefined : { best, playCount: 1, history: [] };
      },
    });
    expect(result.bests.map((b) => [b.id, b.title, b.best])).toEqual([
      ['game-typing:java-oni', 'コードタイピング（Java・鬼）', '20 WPM'],
      ['game-typing:python-easy', 'コードタイピング（Python・かんたん）', '30 WPM'],
      ['game-typing:other', 'コードタイピング（その他）', '10 WPM'],
    ]);
  });

  it('Tip にカテゴリ名を付ける', () => {
    expect(data.tip).toEqual({ label: 'VS Code', text: 'Ctrl+P でファイルを開く', keys: 'Ctrl+P' });
  });

  it('バージョンと更新の状態をそのまま渡す', () => {
    const version = { state: 'latest' as const, current: '0.4.0', latest: '0.4.0' };
    expect(
      buildHomeData({ features: [], recentIds: [], scoreOf: () => undefined, version }).version,
    ).toEqual(version);
  });

  it('何も無いときは空', () => {
    expect(
      buildHomeData({ features: [features[0]!], recentIds: [], scoreOf: () => undefined }),
    ).toEqual({ sections: [], recent: [], bests: [] });
  });
});
