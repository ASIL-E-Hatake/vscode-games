import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';
import { commandBuilderData as data } from './fixtures';

const SEARCH = 'やりたいことを検索';
const linuxCount = data.templates.filter((t) => t.tab === 'linux').length;
const gitCount = data.templates.filter((t) => t.tab === 'git').length;
const dockerCount = data.templates.filter((t) => t.tab === 'docker').length;

/** 一覧からひな形を選ぶ */
const pick = (page: Page, id: string) => page.locator(`.template-item[data-id="${id}"]`).first();

/** Tab を押し続けて、条件に合う要素にフォーカスを移す（キーボードだけの操作） */
async function tabTo(page: Page, selector: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`${selector} にフォーカスが移りません`);
}

test.describe('command-builder', () => {
  for (const theme of THEMES) {
    test(`初期表示: 一覧と最初のひな形を表示し、必須の入力を促す（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      await expect(page.getByRole('heading', { level: 1, name: 'コマンド組み立て' })).toBeVisible();
      await expect(page.locator('.template-item')).toHaveCount(linuxCount);
      await expect(page.getByText(`${linuxCount} 件`)).toBeVisible();
      // 先頭のひな形（フォルダを丸ごとコピーする）が選ばれ、必須の項目が空なので入力を促す
      await expect(pick(page, 'cp-dir')).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('#cb-title')).toHaveText('フォルダを丸ごとコピーする');
      await expect(page.getByTestId('status')).toHaveText(
        '「コピー元」、「コピー先」を入れてください',
      );
      // platform が linux なので既定は bash
      await expect(page.getByRole('button', { name: 'bash', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Linux と Git の 2 つのタブがあり、最初は Linux
      await expect(page.getByRole('tab').first()).toHaveText(`すべて (${linuxCount})`);
      await expect(page.getByRole('button', { name: 'Linux', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await webview.screenshot(`command-builder/initial-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  for (const theme of THEMES) {
    test(`入力するとコマンド・部品の意味・注意を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      await page.getByLabel('コピー元').fill('./src/app');
      await page.getByLabel('コピー先').fill('/tmp/my backup/');
      await page.getByLabel('更新日時・権限を保つ').check();
      await expect(page.getByTestId('command')).toHaveText("cp -rp ./src/app '/tmp/my backup/'");
      const parts = page.getByTestId('parts');
      await expect(parts.getByRole('row', { name: /-p 更新日時・権限を保つ/ })).toBeVisible();
      await expect(parts).toContainText('引用符で囲んだ');
      await expect(page.getByTestId('warnings')).toContainText(
        'その中にコピー元のフォルダが作られる',
      );
      await webview.screenshot(`command-builder/filled-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードだけでひな形を検索して選び、入力してコピーできる（コピーのメッセージを送る）', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', { data });
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('tar.gz にまとめる');
    await expect(page.locator('.template-item')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(pick(page, 'tar-create')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cb-title')).toHaveText('フォルダを tar.gz にまとめる');

    await tabTo(page, '#param-archive');
    await page.keyboard.type('backup.tar.gz');
    await page.keyboard.press('Tab');
    await expect(page.locator('#param-dir')).toBeFocused();
    await page.keyboard.type('my app');
    await expect(page.getByTestId('command')).toHaveText("tar -czf backup.tar.gz 'my app'");

    await tabTo(page, 'button.copy');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: "tar -czf backup.tar.gz 'my app'" });
    await expect(page.locator('.copied')).toContainText('コピーしました');
    // 最近使ったもの・入力値を保存し、一覧の上に「最近使ったもの」を出す
    const saved = await webview.messages();
    expect(saved).toContainEqual({ type: 'storage/set', key: 'recent', value: ['tar-create'] });
    expect(saved).toContainEqual(
      expect.objectContaining({
        type: 'storage/set',
        key: 'values',
        value: expect.objectContaining({
          'tar-create': expect.objectContaining({ archive: 'backup.tar.gz', dir: 'my app' }),
        }),
      }),
    );
    await page.getByRole('searchbox', { name: SEARCH }).fill('');
    await expect(page.getByTestId('recent').locator('.template-item')).toHaveText([
      'フォルダを tar.gz にまとめる',
    ]);
    // 実行・ターミナルへの貼り付けのメッセージは送らない
    expect(saved.map((m) => m.type)).not.toContain('custom');
  });

  for (const theme of THEMES) {
    test(`Git: キーボードで種類を切り替え、危ない操作は注意を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      await page.getByRole('button', { name: 'Linux', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Git', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Git', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('tab').first()).toHaveText(`すべて (${gitCount})`);
      await expect(page.locator('.template-item')).toHaveCount(gitCount);
      await expect(page.getByText(`${gitCount} 件`)).toBeVisible();
      // 先頭はブランチ分類のひな形。Git は bash でも PowerShell でも同じ部品（クォートだけ変わる）
      await expect(pick(page, 'branch-create')).toHaveAttribute('aria-current', 'true');

      await page.getByRole('searchbox', { name: SEARCH }).fill('変更ごと取り消す');
      await pick(page, 'reset-hard').click();
      await expect(page.getByTestId('danger')).toContainText('元に戻せない');
      await expect(pick(page, 'reset-hard')).toContainText('⚠ 注意');
      await expect(page.getByTestId('command')).toHaveText('git reset --hard HEAD~1');
      await webview.screenshot(`command-builder/git-danger-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  for (const theme of THEMES) {
    test(`Docker: タブを切り替え、フォルダの共有は bash と PowerShell で書き分け、データを消す操作は注意を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      await page.getByRole('button', { name: 'Docker', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('tab').first()).toHaveText(`すべて (${dockerCount})`);
      await expect(page.locator('.template-item')).toHaveCount(dockerCount);
      // 分類のタブ（コンテナ・イメージ・Compose・片付け・調べる）
      for (const label of ['コンテナ', 'イメージ', 'Compose', '片付け', '調べる']) {
        await expect(page.getByRole('tab', { name: new RegExp(`^${label}`) })).toBeVisible();
      }

      await pick(page, 'run').click();
      await page.locator('#param-image').fill('node:22');
      await page.locator('#param-mountTo').fill('/app');
      await expect(page.getByTestId('command')).toContainText(
        'docker run -d -v "$(pwd)":/app node:22',
      );
      await page.getByRole('button', { name: 'PowerShell', exact: true }).click();
      await expect(page.getByTestId('command')).toContainText('-v "${PWD}":/app node:22');
      await webview.screenshot(`command-builder/docker-filled-${theme}`);

      await pick(page, 'compose-down-volumes').click();
      await expect(page.getByTestId('danger')).toContainText('元に戻せない');
      await expect(pick(page, 'compose-down-volumes')).toContainText('⚠ 注意');
      await page.getByLabel('データが消えることを理解した').check();
      await expect(page.getByTestId('command')).toHaveText('docker compose down -v');
      await webview.screenshot(`command-builder/docker-danger-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('Git: キーボードだけでひな形を選び、入力してコピーできる', async ({ webview, page }) => {
    await webview.open('command-builder', { data });
    await page.getByRole('button', { name: 'Git', exact: true }).click();
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('メッセージを付けてコミット');
    await expect(page.locator('.template-item')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(pick(page, 'commit-message')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cb-title')).toHaveText('メッセージを付けてコミットする');

    await tabTo(page, '#param-message');
    await page.keyboard.type("it's a fix");
    await expect(page.getByTestId('command')).toHaveText("git commit -m 'it'\\''s a fix'");
    await webview.screenshot('command-builder/git-filled-dark');

    // PowerShell では ' を 2 つ重ねる
    await page.getByRole('button', { name: 'PowerShell', exact: true }).click();
    await expect(page.getByTestId('command')).toHaveText("git commit -m 'it''s a fix'");

    await tabTo(page, 'button.copy');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: "git commit -m 'it''s a fix'" });
    await expect(page.locator('.copied')).toContainText('コピーしました');
  });

  test('Windows では PowerShell が既定。PowerShell に無い操作は理由と bash 版への切り替えを表示する', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', { data: { ...data, platform: 'win32' } });
    const ps = page.getByRole('button', { name: 'PowerShell', exact: true });
    await expect(ps).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('コピー元').fill('my docs');
    await page.getByLabel('コピー先').fill('バックアップ');
    await expect(page.getByTestId('command')).toHaveText(
      "Copy-Item -Path 'my docs' -Destination 'バックアップ' -Recurse",
    );

    // 一覧で PowerShell 版の無いひな形に印を付ける
    await expect(pick(page, 'chmod-num')).toContainText('PowerShell 版なし');
    await pick(page, 'chmod-num').click();
    await expect(page.getByTestId('unsupported')).toContainText(
      'PowerShell には同じ操作がありません',
    );
    await expect(page.getByTestId('unsupported')).toContainText('WSL');
    await expect(page.getByTestId('command')).toHaveCount(0);
    await webview.screenshot('command-builder/unsupported-dark');

    await page.getByRole('button', { name: 'bash 版を表示する' }).click();
    await expect(page.getByRole('button', { name: 'bash', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'bash', exact: true })).toBeFocused();
    await page.getByLabel('ファイル・フォルダ').fill('deploy.sh');
    await expect(page.getByTestId('command')).toHaveText('chmod 755 deploy.sh');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'storage/set', key: 'shell', value: 'bash' });
  });

  test('保存したシェル・最近使ったもの・入力値を復元する', async ({ webview, page }) => {
    await webview.open('command-builder', {
      data,
      storage: {
        shell: 'powershell',
        recent: ['grep-rn', 'no-such-template'],
        values: { 'grep-rn': { pattern: 'TODO', dir: '.', include: '*.java' } },
      },
    });
    await expect(page.locator('#cb-title')).toHaveText(
      '文字列を含む行を探す（フォルダの中を全部）',
    );
    await expect(page.getByTestId('recent').locator('.template-item')).toHaveCount(1);
    await expect(page.getByLabel('探す文字列')).toHaveValue('TODO');
    await expect(page.getByTestId('command')).toHaveText(
      "Get-ChildItem -Path . -Recurse -File -Filter '*.java' | Select-String -Pattern 'TODO' -CaseSensitive",
    );
  });

  test('危ない操作は注意を表示し、入力内容による落とし穴も警告する', async ({ webview, page }) => {
    await webview.open('command-builder', { data });
    await page.getByRole('searchbox', { name: SEARCH }).fill('差分だけ同期');
    await pick(page, 'rsync').click();
    // 入力前は「/ で終わっていない」などの警告を出さない
    await expect(page.getByTestId('warnings')).toHaveCount(0);
    await page.getByLabel(/^コピー元（/).fill('./photos');
    await page.getByLabel(/^コピー先/).fill('/mnt/backup/');
    await expect(page.getByTestId('command')).toHaveText('rsync -avn ./photos /mnt/backup/');
    await expect(page.getByTestId('warnings')).toContainText('フォルダごと');
    await page.getByLabel('コピー元に無いファイルをコピー先から消す').check();
    await expect(page.getByTestId('warnings')).toContainText(
      '--delete はコピー先にしか無いファイルを消す',
    );

    await page.getByRole('searchbox', { name: SEARCH }).fill('フォルダを中身ごと削除');
    await pick(page, 'rm-dir').click();
    await expect(page.getByTestId('danger')).toContainText('元に戻せない');
    await expect(pick(page, 'rm-dir')).toContainText('⚠ 注意');
  });

  test('検索で見つからなければ案内を表示し、関連する辞書を開ける', async ({ webview, page }) => {
    await webview.open('command-builder', { data });
    const search = page.getByRole('searchbox', { name: SEARCH });
    await search.fill('存在しない語XYZ');
    await expect(page.locator('.template-item')).toHaveCount(0);
    await expect(page.getByText('該当するものがありません')).toBeVisible();
    await search.fill('');
    await page.getByLabel('コピー元').fill('a');
    await page.getByLabel('コピー先').fill('b');
    await page.getByRole('button', { name: 'Linux コマンド辞書を開く（cp）' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'linux-dict' });
  });

  test('他の機能から target（ひな形の ID）付きで開かれると、そのひな形が選ばれる（タブも切り替わる）', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', { data });
    await expect(pick(page, 'cp-dir')).toHaveAttribute('aria-current', 'true');
    // すでに開いているパネルに target が届く（Git タブのひな形）
    await webview.send({ type: 'target', target: 'push-upstream' });
    await expect(page.getByRole('button', { name: 'Git', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pick(page, 'push-upstream')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('tab', { name: /^リモート/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#cb-title')).toHaveText('ブランチを初めて push する（-u）');
    // 存在しない ID は無視し、Linux のひな形にも切り替えられる
    await webview.send({ type: 'target', target: 'not-exist' });
    await expect(pick(page, 'push-upstream')).toHaveAttribute('aria-current', 'true');
    await webview.send({ type: 'target', target: 'cp-dir' });
    await expect(page.getByRole('button', { name: 'Linux', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pick(page, 'cp-dir')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('tab', { name: /^ファイル操作/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  for (const theme of THEMES) {
    test(`分類のタブ: 件数付きで並び、矢印キーで切り替えると一覧がその分類だけになる（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      const linux = data.templates.filter((t) => t.tab === 'linux');
      const fileCount = linux.filter((t) => t.category === 'file').length;
      const tablist = page.getByRole('tablist', { name: 'やりたいことの分類' });
      await expect(tablist.getByRole('tab').first()).toHaveText(`すべて (${linuxCount})`);
      await expect(tablist.getByRole('tab').nth(1)).toHaveText(`ファイル操作 (${fileCount})`);
      // 「すべて」では分類の見出しごとに並ぶ
      await expect(page.getByTestId('category').first().locator('h2')).toHaveText('ファイル操作');

      await tablist.getByRole('tab').first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(tablist.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(tablist.getByRole('tab').nth(1)).toBeFocused();
      await expect(page.locator('.template-item')).toHaveCount(fileCount);
      await expect(page.getByText(`${fileCount} 件`)).toBeVisible();
      // タブ名と同じ見出しは出さず、先頭のひな形が選ばれる
      await expect(page.locator('.template-group h2')).toHaveCount(0);
      await expect(pick(page, 'cp-dir')).toHaveAttribute('aria-current', 'true');
      await page.keyboard.press('End');
      await expect(tablist.getByRole('tab').last()).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('category').locator('.template-item').first()).not.toHaveCount(
        0,
      );
      // 選んだ分類を保存する
      await expect
        .poll(() => webview.messages())
        .toContainEqual(
          expect.objectContaining({
            type: 'storage/set',
            key: 'category',
            value: expect.objectContaining({ linux: linux.at(-1)!.category }),
          }),
        );
      await webview.screenshot(`command-builder/category-tab-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('検索すると各タブの件数が検索に合う数になり、Git に切り替えても分類は種類ごとに覚える', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', { data });
    await page.getByRole('searchbox', { name: SEARCH }).fill('存在しない語XYZ');
    await expect(page.getByRole('tab', { name: /^すべて/ })).toHaveText('すべて (0)');
    await expect(page.getByRole('tab', { name: /^ファイル操作/ })).toHaveText('ファイル操作 (0)');
    await page.getByRole('searchbox', { name: SEARCH }).fill('');
    await page.getByRole('tab', { name: /^アーカイブ/ }).click();
    await page.getByRole('button', { name: 'Git', exact: true }).click();
    await expect(page.getByRole('tab', { name: /^すべて/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: /^取り消し/ }).click();
    await page.getByRole('button', { name: 'Linux', exact: true }).click();
    await expect(page.getByRole('tab', { name: /^アーカイブ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('保存した種類・分類のタブを復元する（存在しない分類は「すべて」に戻す）', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', {
      data,
      storage: { kind: 'git', category: { git: 'undo', linux: 'nothing' } },
    });
    await expect(page.getByRole('button', { name: 'Git', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('tab', { name: /^取り消し/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: 'Linux', exact: true }).click();
    await expect(page.getByRole('tab', { name: /^すべて/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
