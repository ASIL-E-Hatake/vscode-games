// L4 統合テスト: ゲームのスコアがホームの自己ベストに反映されること、設定でゲームを隠せること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage, scoreStorageMode } from '../../src/core/storage';
import type { HomeData } from '../../src/features/home/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function setup() {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  const ctx = (featureId: string): FeatureContext => ({
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, featureId),
    app: api.app,
  });
  const initData = <T>(featureId: string) =>
    api.app.registry.get(featureId)!.initData!(ctx(featureId)) as T;
  return { api, initData };
}

describe('ゲーム', () => {
  afterEach(async () => {
    await vscode.workspace
      .getConfiguration('hatake-gottani')
      .update('games.enabled', undefined, vscode.ConfigurationTarget.Global);
  });

  it('反射神経テストはゲームとして登録され、通常・Go/No-Go・Go/No-Go 上級の 3 モードで低いほど良いスコアを持つ', async () => {
    const { api } = await setup();
    const game = api.app.registry.get('game-reaction');
    assert.equal(game?.category, 'game');
    assert.equal(game?.score?.order, 'lower');
    assert.equal(game?.score?.unit, ' ms');
    assert.deepEqual(
      game?.score?.modes?.map((m) => m.id),
      ['normal', 'go-nogo', 'go-nogo-hard'],
    );
    assert.ok(game?.playTime);
  });

  it('モード導入前の形式で保存された反射神経テストの記録は、通常モードの記録として読める', async () => {
    const { api, initData } = await setup();
    // v0.1.0 はモードなしのキー（hatake-gottani.game-reaction.score）に保存していた
    const legacy = new ScopedStorage(api.app.store, 'game-reaction');
    await legacy.delete('score.go-nogo');
    await legacy.delete('score.go-nogo-hard');
    await legacy.set('score', {
      best: 231,
      playCount: 4,
      history: [{ score: 231, at: '2026-10-01T00:00:00.000Z' }],
    });
    type Init = { modes?: Record<string, { best?: number; playCount: number }> };
    assert.deepEqual(initData<Init>('game-reaction').modes?.normal, { best: 231, playCount: 4 });

    // 通常モードの記録は同じキーに続けて保存され、Go/No-Go は別に記録される
    const handle = (mode: string, score: number) =>
      api.app.scores.submit(
        'game-reaction',
        score,
        'lower',
        scoreStorageMode(api.app.registry.get('game-reaction')?.score?.modes, mode),
      );
    await handle('normal', 220);
    await handle('go-nogo', 480);
    let game = initData<Init>('game-reaction');
    assert.deepEqual(game.modes?.normal, { best: 220, playCount: 5 });
    assert.deepEqual(game.modes?.['go-nogo'], { best: 480, playCount: 1 });
    // 上級はまだ遊んでいないので記録なし（ホームにも出ない）
    assert.deepEqual(game.modes?.['go-nogo-hard'], { playCount: 0 });
    assert.equal(legacy.get<{ playCount: number }>('score')?.playCount, 5);
    assert.equal(
      initData<HomeData>('home').bests.filter((b) => b.featureId === 'game-reaction').length,
      2,
    );

    // 上級は別のキー（score.go-nogo-hard）に記録し、通常・Go/No-Go の記録は変わらない
    await handle('go-nogo-hard', 560);
    game = initData<Init>('game-reaction');
    assert.deepEqual(game.modes?.['go-nogo-hard'], { best: 560, playCount: 1 });
    assert.deepEqual(game.modes?.normal, { best: 220, playCount: 5 });
    assert.deepEqual(game.modes?.['go-nogo'], { best: 480, playCount: 1 });
    assert.equal(legacy.get<{ best: number }>('score.go-nogo-hard')?.best, 560);

    const home = initData<HomeData>('home');
    const bests = home.bests.filter((b) => b.featureId === 'game-reaction');
    assert.deepEqual(
      bests.map((b) => [b.title, b.best]),
      [
        ['反射神経テスト（通常）', '220 ms'],
        ['反射神経テスト（Go/No-Go）', '480 ms'],
        ['反射神経テスト（Go/No-Go 上級）', '560 ms'],
      ],
    );
  });

  it('モードのあるゲームは、モードごとに記録し、ホームにもモードごとに表示する', async () => {
    const { api, initData } = await setup();
    await api.app.scores.submit('game-slide-puzzle', 95, 'lower', '3x3');
    await api.app.scores.submit('game-slide-puzzle', 400, 'lower', '4x4');
    await api.app.scores.submit('game-slide-puzzle', 900, 'lower', '5x5');
    const game = initData<{ modes?: Record<string, { best?: number }> }>('game-slide-puzzle');
    assert.deepEqual(Object.keys(game.modes ?? {}), ['3x3', '4x4', '5x5']);
    assert.equal(game.modes?.['3x3']?.best, 95);
    assert.equal(game.modes?.['4x4']?.best, 400);
    // 5×5 は 3×3・4×4 とは別の記録（既存の記録はそのまま）
    assert.equal(game.modes?.['5x5']?.best, 900);
    const home = initData<HomeData>('home');
    const titles = home.bests
      .filter((b) => b.featureId === 'game-slide-puzzle')
      .map((b) => b.title);
    assert.deepEqual(titles, [
      'スライドパズル（3×3（かんたん））',
      'スライドパズル（4×4（ふつう））',
      'スライドパズル（5×5（鬼））',
    ]);
  });

  it('コードタイピングに 5 種類のお題が読み込まれる', async () => {
    const { initData } = await setup();
    const data = initData<{ snippets: Record<string, string[]> }>('game-typing');
    // pack はワークスペースの問題パック（tests/fixtures/workspace/.vscode/hatake-gottani.pack.yaml）のお題
    assert.deepEqual(Object.keys(data.snippets).sort(), [
      'java',
      'javascript',
      'linux',
      'pack',
      'python',
      'ruby',
    ]);
    for (const [id, list] of Object.entries(data.snippets))
      if (id !== 'pack') assert.ok(list.length >= 20);
  });

  it('コードタイピングの自己ベストは言語 × 難易度ごと。「ふつう」は言語ごとの記録を引き継ぐ（苦手復習は含めない）', async () => {
    const { api, initData } = await setup();
    const game = api.app.registry.get('game-typing');
    const langs = ['java', 'python', 'javascript', 'ruby', 'linux'];
    assert.deepEqual(
      game?.score?.modes?.map((m) => m.id),
      [...langs.flatMap((l) => [`${l}-easy`, l, `${l}-oni`]), 'pack'],
    );
    // 「ふつう」は難易度を入れる前と同じ保存キー（score.java）を使う
    await api.app.scores.submit('game-typing', 41, 'higher', 'java');
    const storage = new ScopedStorage(api.app.store, 'game-typing');
    assert.ok((storage.get<{ best: number }>('score.java')?.best ?? 0) >= 41);
    await api.app.scores.submit('game-typing', 23, 'higher', 'java-oni');
    type Init = { modes?: Record<string, { best?: number; playCount: number }> };
    const data = initData<Init>('game-typing');
    assert.ok((data.modes?.java?.best ?? 0) >= 41);
    assert.ok((data.modes?.['java-oni']?.best ?? 0) >= 23);
    assert.equal(data.modes?.review, undefined);
    // ホームは言語ごとに、記録のある最も難しい難易度の 1 行だけ
    const home = initData<HomeData>('home');
    const titles = home.bests.filter((b) => b.featureId === 'game-typing').map((b) => b.title);
    assert.deepEqual(
      titles.filter((t) => t.includes('Java')),
      ['コードタイピング（Java・鬼）'],
    );
    assert.ok(home.bests.every((b) => !b.title.includes('苦手復習')));

    // 苦手の記録（Webview が bridge.save で保存する review.<言語>）は機能の保存領域に残る
    const review = { schemaVersion: 1, entries: [] };
    await storage.set('review.java', review);
    assert.deepEqual(storage.get('review.java'), review);
  });

  it('ショートカット早押しクイズに「はじめての VS Code」のショートカットとスコアが渡される', async () => {
    const { api, initData } = await setup();
    const game = api.app.registry.get('game-shortcut-quiz');
    assert.equal(game?.category, 'game');
    assert.equal(game?.score?.order, 'higher');
    assert.equal(game?.score?.unit, ' 問');
    assert.deepEqual(game?.score?.modes, [
      { id: 'normal', label: 'ふつう', legacy: true },
      { id: 'hard', label: '上級' },
    ]);
    await api.app.scores.submit('game-shortcut-quiz', 12, 'higher');
    const data = initData<{
      playCount: number;
      modes?: Record<string, { best?: number; playCount: number }>;
      os: string;
      shortcuts: { action: string; win: string; mac: string }[];
    }>('game-shortcut-quiz');
    const normal = data.modes?.normal;
    assert.ok(normal?.best !== undefined && normal.best >= 12);
    assert.ok(data.playCount >= 1);
    assert.equal(data.os, process.platform === 'darwin' ? 'mac' : 'win');
    assert.ok(data.shortcuts.length >= 20);
    assert.ok(data.shortcuts.every((s) => s.action && s.win && s.mac));
  });

  it('モード導入前のショートカット早押しクイズの記録は「ふつう」に引き継がれ、上級は別に記録する', async () => {
    const { api, initData } = await setup();
    // v0.2.0 はモードなしのキー（hatake-gottani.game-shortcut-quiz.score / ghost）に保存していた
    const storage = new ScopedStorage(api.app.store, 'game-shortcut-quiz');
    const ghost = {
      version: 1,
      score: 21,
      samples: [
        [0, 0],
        [60_000, 21],
      ],
    };
    await storage.delete('score.hard');
    await storage.set('score', {
      best: 21,
      playCount: 3,
      history: [{ score: 21, at: '2026-10-10T00:00:00.000Z' }],
    });
    await storage.set('ghost', ghost);
    type Init = { modes?: Record<string, { best?: number; playCount: number }> };
    let data = initData<Init>('game-shortcut-quiz');
    assert.deepEqual(data.modes?.normal, { best: 21, playCount: 3 });
    assert.deepEqual(data.modes?.hard, { playCount: 0 });

    // Webview は「ふつう」を mode: 'normal'、上級を 'hard' で送る（ホストが legacy を解決する）
    const modes = api.app.registry.get('game-shortcut-quiz')?.score?.modes;
    await api.app.scores.submit(
      'game-shortcut-quiz',
      15,
      'higher',
      scoreStorageMode(modes, 'normal'),
    );
    await api.app.scores.submit('game-shortcut-quiz', 9, 'higher', scoreStorageMode(modes, 'hard'));
    data = initData<Init>('game-shortcut-quiz');
    assert.deepEqual(data.modes?.normal, { best: 21, playCount: 4 });
    assert.deepEqual(data.modes?.hard, { best: 9, playCount: 1 });
    assert.equal(storage.get<{ playCount: number }>('score')?.playCount, 4);
    // ゴースト（Webview が bridge.load / save で読み書きする）はモード導入前のキーのまま残る
    assert.deepEqual(storage.get('ghost'), ghost);

    const home = initData<HomeData>('home');
    assert.deepEqual(
      home.bests.filter((b) => b.featureId === 'game-shortcut-quiz').map((b) => [b.title, b.best]),
      [
        ['ショートカット早押しクイズ（ふつう）', '21 問'],
        ['ショートカット早押しクイズ（上級）', '9 問'],
      ],
    );
  });

  it('バグ探しは 4 言語の問題を渡し（検査専用の fix は含めない）、言語 × 難易度ごとに記録する', async () => {
    const { api, initData } = await setup();
    const game = api.app.registry.get('game-bug-hunt');
    assert.equal(game?.category, 'game');
    assert.equal(game?.score?.order, 'higher');
    assert.ok(game?.playTime);
    const langs = ['java', 'python', 'javascript', 'ruby'];
    const levels = ['easy', 'normal', 'hard'];
    assert.deepEqual(
      game?.score?.modes?.map((m) => m.id),
      [...langs.flatMap((l) => levels.map((d) => `${l}-${d}`)), 'pack'],
    );

    type Init = {
      questions: { id: string; language: string; difficulty: string; bugLines: number[] }[];
      modes?: Record<string, { best?: number; playCount: number }>;
    };
    let data = initData<Init>('game-bug-hunt');
    for (const lang of langs) {
      const list = data.questions.filter((q) => q.language === lang);
      assert.ok(list.length >= 10, `${lang} の問題が 10 問以上`);
      for (const d of levels)
        assert.ok(
          list.some((q) => q.difficulty === d),
          `${lang}-${d}`,
        );
    }
    assert.ok(data.questions.every((q) => q.bugLines.length > 0));
    assert.ok(!JSON.stringify(data.questions).includes('"fix"'), '修正行を Webview に渡さない');

    await api.app.scores.submit('game-bug-hunt', 1200, 'higher', 'python-easy');
    await api.app.scores.submit('game-bug-hunt', 800, 'higher', 'python-hard');
    data = initData<Init>('game-bug-hunt');
    assert.ok((data.modes?.['python-easy']?.best ?? 0) >= 1200);
    assert.ok((data.modes?.['python-hard']?.best ?? 0) >= 800);
    assert.deepEqual(data.modes?.['ruby-normal'], { playCount: 0 });
    // 復習は記録しないためモードに無い
    assert.equal(data.modes?.review, undefined);
  });

  it('出力当てクイズに 4 言語の問題とスコアが渡され、自己ベストは言語 × 難易度ごと（復習は含めない）', async () => {
    const { api, initData } = await setup();
    const game = api.app.registry.get('game-output-quiz');
    assert.equal(game?.category, 'game');
    assert.equal(game?.score?.order, 'higher');
    assert.equal(game?.score?.unit, ' 点');
    const langs = ['java', 'python', 'javascript', 'ruby'];
    assert.deepEqual(
      game?.score?.modes?.map((m) => m.id),
      [...langs.flatMap((l) => [`${l}-easy`, `${l}-normal`, `${l}-hard`]), 'pack'],
    );
    type Data = {
      modes?: Record<string, { best?: number; playCount: number }>;
      questions: { id: string; language: string; difficulty: string; answer: string }[];
    };
    let data = initData<Data>('game-output-quiz');
    for (const lang of langs) {
      const list = data.questions.filter((q) => q.language === lang);
      assert.ok(list.length >= 15, `${lang} の問題が 15 問未満です`);
      assert.ok(list.every((q) => q.id.startsWith(`${lang}-`) && q.answer !== undefined));
    }
    await api.app.scores.submit('game-output-quiz', 1450, 'higher', 'python-hard');
    await api.app.scores.submit('game-output-quiz', 900, 'higher', 'java-easy');
    data = initData<Data>('game-output-quiz');
    assert.ok((data.modes?.['python-hard']?.best ?? 0) >= 1450);
    assert.ok((data.modes?.['java-easy']?.best ?? 0) >= 900);
    assert.equal(data.modes?.review, undefined);
    const home = initData<HomeData>('home');
    assert.ok(
      home.bests.some((b) => b.featureId === 'game-output-quiz' && b.title.includes('Python')),
    );

    // 間違えた問題の記録（Webview が bridge.save で保存する missed）は機能の保存領域に残る
    const storage = new ScopedStorage(api.app.store, 'game-output-quiz');
    const missed = {
      schemaVersion: 1,
      entries: [{ id: 'python-int-division', misses: 1, lastMissAt: 0, streak: 0 }],
    };
    await storage.set('missed', missed);
    assert.deepEqual(storage.get('missed'), missed);
  });

  it('出力当てクイズ・バグ探しの initData に、シークレット問題の条件に使う図鑑の収集率が入る', async () => {
    const { api, initData } = await setup();
    type Data = {
      glossaryPercent?: number;
      questions: { id: string; secret?: boolean; unlock?: { type: string } }[];
    };
    for (const id of ['game-output-quiz', 'game-bug-hunt']) {
      const before = initData<Data>(id);
      assert.equal(before.glossaryPercent, api.app.glossary.progress().percent, id);
      // シークレット問題は出現条件（unlock）付きで Webview に渡す（通常の出題から外すのは Webview 側）
      const secrets = before.questions.filter((q) => q.secret);
      assert.ok(secrets.length >= 4, `${id} のシークレット問題`);
      assert.ok(secrets.every((q) => q.unlock?.type));
    }
    // 用語を発見すると収集率が上がり、次の initData に反映される
    const glossary = new ScopedStorage(api.app.store, 'glossary');
    await glossary.delete('discovered');
    const zero = initData<Data>('game-output-quiz').glossaryPercent ?? -1;
    await api.app.glossary.discover('game-output-quiz', ['variable', 'loop', 'string', 'list']);
    const after = initData<Data>('game-output-quiz').glossaryPercent ?? -1;
    assert.equal(zero, 0);
    assert.ok(after > zero, `収集率 ${zero}% → ${after}%`);
    assert.equal(after, api.app.glossary.progress().percent);
  });

  it('設定でゲームを非表示にすると、メニューとホームからゲームが消える', async () => {
    const { api, initData } = await setup();
    assert.ok(api.app.registry.visible(api.app.menuFilter()).some((f) => f.category === 'game'));
    await vscode.workspace
      .getConfiguration('hatake-gottani')
      .update('games.enabled', false, vscode.ConfigurationTarget.Global);
    assert.ok(!api.app.registry.visible(api.app.menuFilter()).some((f) => f.category === 'game'));
    const home = initData<HomeData>('home');
    assert.ok(!home.sections.some((s) => s.category === 'game'));
  });
});
