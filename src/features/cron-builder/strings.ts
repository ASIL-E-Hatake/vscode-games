type FieldKey = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

const WEEKDAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const strings = {
  title: 'cron 式の組み立て',
  description:
    'cron 式（Linux の定期実行）をフォームで組み立てたり、貼り付けた式を日本語で解説して次の実行日時を確かめたりします。',
  lead: 'cron は Linux の定期実行の仕組みです。式をコピーして crontab に書きます（拡張機能はコマンドを実行しません）。',
  windowsNote:
    'Windows の「タスク スケジューラー」とは別の仕組みです。cron は Linux・WSL・Mac のサーバーで使います。',
  timezoneNote:
    '実行される時刻はサーバー（cron が動いているマシン）のタイムゾーンの設定に従います。下の「次の実行日時」はこの PC のローカル時刻で計算しています。',

  tabsLabel: '機能',
  tabBuild: '組み立て',
  tabExplain: '解説',

  weekdayShort: WEEKDAY_SHORT,
  fieldLabels: {
    minute: '分',
    hour: '時',
    dayOfMonth: '日',
    month: '月',
    dayOfWeek: '曜日',
  } satisfies Record<FieldKey, string>,

  // 組み立て
  frequencyLegend: '実行する間隔',
  frequencies: {
    minute: '毎分',
    hour: '毎時',
    day: '毎日',
    week: '毎週',
    month: '毎月',
    custom: '詳細',
  },
  minuteLabel: '分（0〜59）',
  hourLabel: '時（0〜23）',
  weekdaysLegend: '曜日',
  dayOfMonthLabel: '日（1〜31）',
  customHint: '5 つのフィールドを直接入力します（例: 分に `*/15`、曜日に `1-5`）。',
  resultHeading: '作った cron 式',
  exprLabel: 'cron 式',
  exprCopyLabel: 'cron 式をコピー',
  commandLabel: '実行するコマンド（crontab に書く 1 行に入ります）',
  crontabHeading: 'crontab に書く 1 行',
  crontabCopyLabel: 'crontab の 1 行をコピー',
  summaryPrefix: '意味: ',
  buildError: (message: string) => `組み立てられません: ${message}`,
  build: {
    badMinute: '分は 0〜59 の整数で入力してください',
    badHour: '時は 0〜23 の整数で入力してください',
    noWeekday: '曜日を 1 つ以上選んでください',
    badWeekday: '曜日が正しくありません',
    badDay: '日は 1〜31 の整数で入力してください',
    placeholderCommand: '/path/to/script.sh',
  },

  // 解説
  inputLabel: 'cron 式（例: 0 9 * * 1）',
  inputPlaceholder: '0 9 * * 1',
  examplesLabel: '例を入れる',
  examples: ['0 9 * * 1', '*/15 9-17 * * 1-5', '0 0 1 * *', '30 8 15 * 1', '@daily'],
  explainEmpty: 'cron 式を入力すると、意味と次の実行日時を表示します。',
  summaryHeading: '意味',
  fieldsHeading: '各フィールド',
  fieldsTableLabel: '各フィールドの意味',
  columnField: 'フィールド',
  columnValue: '値',
  columnMeaning: '意味',
  nextHeading: '次の 5 回の実行日時（ローカル時刻）',
  nextNone:
    '今後 9 年以内に実行される日がありません（存在しない日付の指定などを確認してください）。',
  errorHeading: 'この式は使えません',
  notesHeading: '注意',

  issue: {
    empty: '式が空です。5 つのフィールド（分 時 日 月 曜日）を空白で区切って入力してください',
    unknownAlias: (a: string) =>
      `別名「${a}」は使えません（@yearly・@monthly・@weekly・@daily・@hourly・@reboot が使えます）`,
    unsupportedFormat:
      '秒付き（6 フィールド）・年付き（7 フィールド）や Quartz 形式は対象外です。標準の 5 フィールド（分 時 日 月 曜日）で入力してください',
    tooMany: (n: number) =>
      `フィールドが ${n} 個あります。標準の cron は 5 個（分 時 日 月 曜日）です。コマンドを含めていませんか`,
    tooFew: (n: number) => `フィールドが ${n} 個しかありません。5 個（分 時 日 月 曜日）必要です`,
    quartz: (t: string) => `「${t}」は Quartz 形式の書き方で、標準の cron では使えません（対象外）`,
    notNumber: (label: string, t: string) =>
      `${label}: 「${t}」は数値（または英略称）ではありません`,
    outOfRange: (label: string, t: string, min: number, max: number) =>
      `${label}: ${t} は範囲外です（${min}〜${max}）`,
    emptyItem: (label: string) => `${label}: カンマ区切りの要素が空です`,
    manySlash: (label: string, part: string) =>
      `${label}: 「${part}」に「/」が複数あります（ステップは 1 つだけ）`,
    badStep: (label: string, step: string) =>
      `${label}: ステップ「${step}」は 1 以上の整数にしてください`,
    badRange: (label: string, range: string) =>
      `${label}: 範囲「${range}」は「始まり-終わり」の形で書いてください`,
    reversedRange: (label: string, range: string) =>
      `${label}: 範囲「${range}」は小さい値から大きい値の順に書いてください`,
    stepNeedsRange: (label: string, part: string) =>
      `${label}: 「${part}」のステップ（/）は「*」または範囲（a-b）と組み合わせてください`,
  },

  explain: {
    every: {
      minute: 'すべての分（毎分）',
      hour: 'すべての時（毎時）',
      dayOfMonth: 'すべての日',
      month: 'すべての月（毎月）',
      dayOfWeek: 'すべての曜日',
    } satisfies Record<FieldKey, string>,
    stepUnit: {
      minute: '分',
      hour: '時間',
      dayOfMonth: '日',
      month: 'か月',
      dayOfWeek: '日',
    } satisfies Record<FieldKey, string>,
    every_n: (n: number, unit: string, first: string) => `${n}${unit}ごと（${first}）`,
    everyDay: '毎日',
    everyMinute: '毎分',
    minutesEvery: (n: number) => `${n}分ごと`,
    hourlyAt: (minutes: string) => `毎時${minutes}`,
    everyMinuteDuring: (hours: string) => `${hours}台は毎分`,
    hoursEvery: (n: number, first: string, minute: number) =>
      `${n}時間ごと（${first}）の${minute}分`,
    hoursAndMinutes: (hours: string, minutes: string) => `${hours}の${minutes}`,
    monthlyOn: (days: string) => `毎月${days}`,
    weeklyOn: (days: string) => `毎週${days}`,
    andJoin: (dom: string, dow: string) => `${dom}、かつ${dow}`,
    orJoin: (dom: string, dow: string) => `${dom} または ${dow}`,
    reboot: 'cron が起動したとき（システムの起動時）に 1 回実行',
    noteReboot: '@reboot は日時では決まらないため、次の実行日時は表示しません。',
    noteOr:
      '日と曜日の両方を指定しているため、「どちらか一方に当てはまる日」に実行されます（両方に当てはまる日だけではありません）。cron 独特の挙動です。',
    noteAnd:
      '日と曜日の一方が「*」で始まる指定（`*/2` など）のため、「日と曜日の両方に当てはまる日」だけ実行されます。',
    noteMonthEnd:
      '29〜31 日は、その日がない月には実行されません（月末ではなく、その月は飛ばされます）。',
  },
};
