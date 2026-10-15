// scripts/icon/icon.svg から、vsix のアイコン media/icon.png（128×128）を作る。
// アイコンを変えたときだけ手で実行する（npm run icon）。作った PNG はコミットする。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SIZE = 128;

async function main() {
  const svg = readFileSync(join('scripts', 'icon', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join('media', 'icon.png'), omitBackground: true });
  await browser.close();
  console.log('media/icon.png を作成しました');
}

void main();
