import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { DURATION_MS, keyLabel, TypingSession } from '../logic';
import { REVIEW_MODE, TYPING_MODES, TYPING_PLAY_MODES } from '../modes';
import { ReviewSource } from '../review';
import { strings } from '../strings';
import { ReviewStore } from './reviewStore';
import './style.css';

/** 結果画面に出す「まだ苦手なお題」の件数 */
const STILL_WEAK_SHOWN = 3;

let snippets: Record<string, string[]> = {};
const langs = TYPING_MODES.map((m) => m.id);
const langLabel = (id: string) => TYPING_MODES.find((m) => m.id === id)?.label ?? id;
const store = new ReviewStore(langs, () => snippets);

function createScene(ctx: GameSceneContext) {
  snippets = (ctx.data as { snippets?: Record<string, string[]> }).snippets ?? {};
  const review = ctx.mode === REVIEW_MODE;
  const lang = ctx.mode && snippets[ctx.mode] ? ctx.mode : 'java';

  // 苦手復習: 全言語の苦手なお題を優先順に出し、克服したものは外す
  const reviewSource = review
    ? new ReviewSource(store.allWeak(), (item) => store.isWeak(item))
    : undefined;
  /** 今のお題の言語 */
  const currentLang = () => reviewSource?.currentItem?.lang ?? lang;
  // 通常モード: プレイ前の苦手（結果に「苦手に追加されたお題」を出すため）
  const weakBefore = new Set(review ? [] : store.weak(lang).map((e) => e.text));

  const session = new TypingSession(
    reviewSource ?? snippets[lang] ?? ['no data'],
    Math.random,
    (text, misses) => store.record(currentLang(), text, misses, true),
  );

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
    class: 'snippet',
    'data-testid': 'typing-snippet',
    'aria-label': strings.snippetLabel,
  });
  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'typing' },
      h('div', { class: 'status' }, timeText, langText, completedText),
      line,
      warning,
    ),
  );

  /** お題を「打った部分・次の 1 文字・残り」に分けて表示する */
  const renderLine = (missed = false) => {
    const text = session.current;
    const pos = session.pos;
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

  const finish = () => {
    if (active) remaining = Math.max(0, deadline - performance.now());
    stop();
    // 途中で終わったお題のミスも苦手として記録する
    if (!session.finished && session.currentMisses > 0) {
      store.record(currentLang(), session.current, session.currentMisses, false);
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
    const result = session.type(e.key);
    if (result === 'complete') {
      // 打ち終えたお題に含まれる用語を、技術用語図鑑で発見済みにする（判定はホスト側）
      bridge.post({ type: 'glossary/discover', text: typed });
      // 苦手復習ですべて克服したら終了する
      if (session.finished) {
        finish();
        return;
      }
      ctx.announce(session.current);
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
    ctx.announce(session.current);
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

/** ルール説明（選んだモードの苦手の件数を添える） */
function rules(mode: string | undefined): string[] {
  introMode = mode;
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
  return [...strings.rules, strings.weakCount(store.weak(mode ?? 'java').length)];
}

/** ルール説明を表示しているモード（rules() が呼ばれるたびに更新） */
let introMode: string | undefined;

/**
 * 苦手復習で苦手が 1 つも無いときは、ルール説明の「スタート」を押せないようにする。
 * game-kit にはスタートを止める仕組みが無いため、ルール説明が描かれるたびにボタンを確かめる
 */
function guardStart(root: HTMLElement) {
  const update = () => {
    const start = root.querySelector<HTMLButtonElement>('[data-testid="game-start"]');
    if (!start) return;
    const blocked = introMode === REVIEW_MODE && store.allWeak().length === 0;
    if (start.disabled === blocked) return;
    start.disabled = blocked;
    // 押せないボタンにフォーカスが残らないよう、選ばれているモードに移す
    if (blocked && (document.activeElement === start || document.activeElement === document.body)) {
      root.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    }
  };
  new MutationObserver(update).observe(root, { childList: true, subtree: true });
}

// ルール説明で苦手の件数を数えるため、game-kit より先に init のお題を受け取る
// （onMessage は登録順に呼ばれる）
bridge.onMessage((m) => {
  if (m.type === 'init') {
    snippets = (m.data as { snippets?: Record<string, string[]> } | undefined)?.snippets ?? {};
  }
});

// 苦手の記録を読んでからゲームを始める（ルール説明に件数を出すため）
void store.load().then(() => {
  const app = document.getElementById('app');
  if (app) guardStart(app);
  runGame({
    title: strings.title,
    rules,
    controls: strings.controls,
    modes: TYPING_PLAY_MODES,
    formatScore: (n) => `${n} WPM`,
    createScene,
  });
});
