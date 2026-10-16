import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { easySnippets } from '../levels';
import { DURATION_MS, keyLabel, TypingSession } from '../logic';
import {
  DEFAULT_LEVEL,
  isTypingLevel,
  REVIEW_MODE,
  TYPING_LEVELS,
  TYPING_MODES,
  TYPING_PLAY_MODES,
  typingRecordMode,
  type TypingLevel,
} from '../modes';
import { OniSource, OniTally, type Typo } from '../oni';
import { ReviewSource } from '../review';
import { strings } from '../strings';
import { ReviewStore } from './reviewStore';
import './style.css';

/** 結果画面に出す「まだ苦手なお題」の件数 */
const STILL_WEAK_SHOWN = 3;
/** 結果画面に出す「見落とした誤りの例」の件数 */
const MISSED_SHOWN = 3;

let snippets: Record<string, string[]> = {};
const langs = TYPING_MODES.map((m) => m.id);
const langLabel = (id: string) => TYPING_MODES.find((m) => m.id === id)?.label ?? id;
const store = new ReviewStore(langs, () => snippets);
const levelOf = (level: string | undefined): TypingLevel =>
  isTypingLevel(level) ? level : DEFAULT_LEVEL;

function createScene(ctx: GameSceneContext) {
  snippets = (ctx.data as { snippets?: Record<string, string[]> }).snippets ?? {};
  const review = ctx.mode === REVIEW_MODE;
  const lang = ctx.mode && snippets[ctx.mode] ? ctx.mode : 'java';
  const level = levelOf(ctx.level);
  const langSnippets = snippets[lang] ?? ['no data'];

  // 苦手復習: 全言語の苦手なお題を優先順に出し、克服したものは外す
  const reviewSource = review
    ? new ReviewSource(store.allWeak(), (item) => store.isWeak(item))
    : undefined;
  // 鬼: 誤りを入れたコードを表示し、正しいコード（今のお題）を打つ
  const oni =
    !review && level === 'oni' ? new OniSource(langSnippets, lang, Math.random) : undefined;
  const tally = oni ? new OniTally() : undefined;
  /** 今のお題の言語 */
  const currentLang = () => reviewSource?.currentItem?.lang ?? lang;
  // 通常モード: プレイ前の苦手（結果に「苦手に追加されたお題」を出すため）
  const weakBefore = new Set(review ? [] : store.weak(lang).map((e) => e.text));

  const session = new TypingSession(
    reviewSource ?? oni ?? (level === 'easy' ? easySnippets(langSnippets) : langSnippets),
    Math.random,
    (text, misses) => {
      // 苦手の記録は難易度で分けず、正しいお題の文字列でまとめる（鬼でも表示した誤りのあるコードではない）
      store.record(currentLang(), text, misses, true);
      if (oni) tally?.close(oni.line, text.length);
    },
  );
  /** 画面に出すお題（鬼は誤りのあるコード） */
  const displayed = () => (oni ? oni.line.shown : session.current);

  let remaining = DURATION_MS;
  let deadline = 0;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const timeText = h('span', { 'data-testid': 'typing-time' });
  const langText = h('span', { 'data-testid': 'typing-lang' });
  langText.hidden = !review;
  const completedText = h('span', { 'data-testid': 'typing-completed' });
  const warning = h('p', { class: 'ime-warning', role: 'alert', 'data-testid': 'typing-ime' });
  warning.hidden = true;
  const line = h('div', {
    class: oni ? 'snippet oni-shown' : 'snippet',
    'data-testid': 'typing-snippet',
    'aria-label': oni ? strings.oniShownLabel : strings.snippetLabel,
  });
  // 鬼: 誤りのあるコードの下に、打った正しいコードを表示する
  const input = oni
    ? h('div', {
        class: 'snippet oni-input',
        'data-testid': 'typing-input',
        'aria-label': strings.oniInputLabel,
      })
    : undefined;
  // ゴースト（苦手復習では使わない）。値は正しく打った文字数
  const ghostView = review ? null : ctx.ghost.view({ unit: strings.ghostUnit });
  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'typing' },
      h('div', { class: 'status' }, timeText, langText, completedText),
      oni ? h('p', { class: 'oni-label', 'aria-hidden': 'true' }, strings.oniShownLabel) : null,
      line,
      oni ? h('p', { class: 'oni-label', 'aria-hidden': 'true' }, strings.oniInputLabel) : null,
      input,
      ghostView,
      warning,
    ),
  );
  if (!review) ctx.ghost.track(0);

  /** お題を「打った部分・次の 1 文字・残り」に分けて表示する */
  const renderLine = (missed = false) => {
    const text = session.current;
    const pos = session.pos;
    if (oni && input) {
      // 鬼: 次に打つ文字は示さない（誤りを見つけるのが課題のため）
      line.textContent = oni.line.shown;
      input.replaceChildren(
        h('span', { class: 'done' }, text.slice(0, pos)),
        h(
          'span',
          { class: `cursor blank${missed ? ' missed' : ''}`, 'data-testid': 'typing-cursor' },
          ' ',
        ),
      );
      return;
    }
    const next = text[pos] ?? '';
    line.replaceChildren(
      h('span', { class: 'done' }, text.slice(0, pos)),
      h(
        'span',
        { class: `cursor${missed ? ' missed' : ''}`, 'data-testid': 'typing-cursor' },
        // 空白は見えるように「␣」で表示する
        next === ' ' ? '␣' : next,
      ),
      h('span', { class: 'rest' }, text.slice(pos + 1)),
    );
  };

  const renderStatus = () => {
    timeText.textContent = strings.timeLeft(Math.ceil(remaining / 1000));
    completedText.textContent = strings.completed(session.completed);
    if (review) langText.textContent = langLabel(currentLang());
  };

  const tick = () => {
    remaining = Math.max(0, deadline - performance.now());
    renderStatus();
    // 次の 1 秒の区切りに合わせて表示を更新する
    tickTimer = setTimeout(tick, remaining % 1000 || 1000);
  };

  /** 苦手復習の結果に出す項目 */
  const reviewDetails = () => {
    const overcome = reviewSource?.overcome ?? [];
    const still = store.allWeak().slice(0, STILL_WEAK_SHOWN);
    return [
      {
        label: strings.overcome,
        value: overcome.length > 0 ? overcome.map((i) => i.text).join('\n') : strings.none,
      },
      {
        label: still.length > 0 ? strings.stillWeak(still.length) : strings.stillWeakEmpty,
        value: still.length > 0 ? still.map((i) => i.text).join('\n') : strings.none,
      },
    ];
  };

  /** 鬼の結果に出す項目（見つけて直せた誤り・見落とした誤り） */
  const oniDetails = () => {
    if (!tally) return [];
    const example = (t: Typo) => strings.typoExample(t.wrong, t.right, strings.typoKinds[t.kind]);
    const missed = tally.missed.slice(0, MISSED_SHOWN);
    return [
      { label: strings.foundTypos, value: strings.items(tally.found.length) },
      { label: strings.missedTypos, value: strings.items(tally.missed.length) },
      ...(missed.length > 0
        ? [{ label: strings.missedExamples(missed.length), value: missed.map(example).join('\n') }]
        : []),
    ];
  };

  const finish = () => {
    if (active) remaining = Math.max(0, deadline - performance.now());
    stop();
    if (!session.finished) {
      // 途中で終わったお題のミスも苦手として記録する
      if (session.currentMisses > 0) {
        store.record(currentLang(), session.current, session.currentMisses, false);
      }
      // 鬼: 打ち終えた範囲の誤りまでを数える
      if (oni) tally?.close(oni.line, session.pos);
    }
    const elapsed = DURATION_MS - remaining;
    remaining = 0;
    // 苦手復習は、すべて克服して早く終わることがあるため、かかった時間で計算する
    const stats = session.stats(review ? Math.max(elapsed, 1) : DURATION_MS);
    const common = [
      { label: strings.wpm, value: String(stats.wpm) },
      { label: strings.accuracy, value: strings.percent(stats.accuracy) },
      { label: strings.completedLabel, value: String(stats.completed) },
      { label: strings.misses, value: strings.times(stats.misses) },
    ];
    if (review) {
      // 練習用のため自己ベストは記録しない（score を渡さない）
      ctx.finish({
        message: session.finished
          ? strings.reviewAllClear
          : strings.reviewDone(reviewSource?.overcome.length ?? 0),
        details: [...common, ...reviewDetails()],
      });
      return;
    }
    const added = store.weak(lang).filter((e) => !weakBefore.has(e.text)).length;
    ctx.finish({
      score: stats.correct > 0 ? stats.wpm : undefined,
      message: strings.rate(stats.wpm),
      details: [
        ...common,
        ...oniDetails(),
        {
          label: strings.weakKeys,
          value:
            stats.weakKeys.length > 0
              ? stats.weakKeys.map((k) => `${keyLabel(k.key)}（${k.count}）`).join('、')
              : strings.none,
        },
        { label: strings.addedWeak, value: strings.items(added) },
      ],
    });
  };

  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    // 日本語入力中は文字が確定しないため、案内を出す
    if (e.isComposing || e.key === 'Process') {
      warning.textContent = strings.imeWarning;
      warning.hidden = false;
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    warning.hidden = true;
    const typed = session.current;
    const pos = session.pos;
    const result = session.type(e.key);
    if (result === 'miss') tally?.miss(pos);
    else if (!review) ctx.ghost.track(session.correct);
    if (result === 'complete') {
      // 打ち終えたお題に含まれる用語を、技術用語図鑑で発見済みにする（判定はホスト側）
      bridge.post({ type: 'glossary/discover', text: typed });
      // 苦手復習ですべて克服したら終了する
      if (session.finished) {
        finish();
        return;
      }
      ctx.announce(displayed());
      renderStatus();
    }
    renderLine(result === 'miss');
  };

  const stop = () => {
    active = false;
    clearTimeout(endTimer);
    clearTimeout(tickTimer);
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    // 苦手が無いとき（ルール説明で開始できないようにしているが念のため）はすぐ終える
    if (session.finished) {
      finish();
      return;
    }
    active = true;
    deadline = performance.now() + remaining;
    endTimer = setTimeout(finish, remaining);
    document.addEventListener('keydown', onKey);
    tick();
    renderLine();
    ctx.announce(displayed());
  };

  renderLine();
  renderStatus();

  return {
    start: run,
    pause: () => {
      remaining = Math.max(0, deadline - performance.now());
      stop();
    },
    resume: run,
    destroy: stop,
  };
}

/** ルール説明（選んだモード・難易度のルールと、苦手の件数を添える） */
function rules(mode: string | undefined, level: string | undefined): string[] {
  if (mode === REVIEW_MODE) {
    const weak = store.allWeak();
    if (weak.length === 0) return [...strings.reviewRules, strings.noWeak];
    const breakdown = langs
      .map((lang) => [lang, weak.filter((i) => i.lang === lang).length] as const)
      .filter(([, n]) => n > 0)
      .map(([lang, n]) => `${langLabel(lang)} ${n}`)
      .join('・');
    return [...strings.reviewRules, strings.reviewCount(weak.length, breakdown)];
  }
  return [
    ...strings.rules,
    ...strings.levelRules[levelOf(level)],
    strings.weakCount(store.weak(mode ?? 'java').length),
  ];
}

// ルール説明で苦手の件数を数えるため、game-kit より先に init のお題を受け取る
// （onMessage は登録順に呼ばれる）
bridge.onMessage((m) => {
  if (m.type === 'init') {
    snippets = (m.data as { snippets?: Record<string, string[]> } | undefined)?.snippets ?? {};
  }
});

const isReview = (mode: string | undefined) => mode === REVIEW_MODE;

// 苦手の記録を読んでからゲームを始める（ルール説明に件数を出すため）
void store.load().then(() => {
  runGame({
    title: strings.title,
    rules,
    controls: strings.controls,
    modes: TYPING_PLAY_MODES,
    // 難易度は言語とは別に選ぶ。苦手復習は難易度と組み合わせない
    levels: {
      label: strings.levelLabel,
      options: TYPING_LEVELS,
      initial: DEFAULT_LEVEL,
      appliesTo: (mode) => !isReview(mode),
      recordMode: (mode, level) => typingRecordMode(mode ?? 'java', levelOf(level)),
    },
    // 苦手が 1 つも無いときは苦手復習を始められない
    canStart: (mode) => !isReview(mode) || store.allWeak().length > 0,
    // ゴースト（正しく打った文字数）。苦手復習は自己ベストを記録しないため使わない
    ghost: { appliesTo: (mode) => !isReview(mode) },
    formatScore: (n) => `${n} WPM`,
    createScene,
  });
});
