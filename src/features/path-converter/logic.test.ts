import { describe, expect, it } from 'vitest';
import {
  cleanInput,
  convertInput,
  parsePath,
  quoteBash,
  quotePowerShell,
  toStringLiteral,
  type ConversionId,
} from './logic';

/** 変換結果を id → 値（変換できないときは undefined）の表にする */
function values(input: string): Partial<Record<ConversionId, string | undefined>> {
  const result = convertInput(input);
  if (!result.ok) throw new Error(`変換できません: ${result.reason}`);
  return Object.fromEntries(result.items.map((i) => [i.id, i.value]));
}

describe('cleanInput', () => {
  it('前後の空白と、全体を囲む引用符を取り除く', () => {
    expect(cleanInput('  C:\\a  ')).toBe('C:\\a');
    expect(cleanInput('"C:\\a b"')).toBe('C:\\a b');
    expect(cleanInput(" 'C:\\a b' ")).toBe('C:\\a b');
  });
  it('片側だけの引用符・途中の引用符はそのまま', () => {
    expect(cleanInput('"C:\\a')).toBe('"C:\\a');
    expect(cleanInput("/tmp/it's")).toBe("/tmp/it's");
  });
});

describe('parsePath（形式の判別）', () => {
  it('空・空白だけは empty', () => {
    expect(parsePath('')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePath('  "" ')).toEqual({ ok: false, reason: 'empty' });
  });
  it.each([
    ['C:\\Users\\me', 'drive', 'Windows のパス'],
    ['c:/Users/me', 'drive', 'Windows のパス'],
    ['\\\\srv\\share\\a', 'unc', 'Windows のネットワークパス（UNC）'],
    ['/mnt/c/Users/me', 'drive', 'WSL のパス（/mnt/c/...）'],
    ['/c/Users/me', 'drive', 'Git Bash のパス（/c/...）'],
    ['/home/me/a', 'posix', 'Linux のパス'],
    ['/mnt/data/a', 'posix', 'Linux のパス'],
    ['file:///C:/a', 'drive', 'file:// URL'],
    ['file://srv/share/a', 'unc', 'file:// URL'],
    ['file:///home/me', 'posix', 'file:// URL'],
    ['src\\main.ts', 'relative', '相対パス'],
    ['./src/main.ts', 'relative', '相対パス'],
  ])('%s → %s', (input, kind, detected) => {
    const r = parsePath(input);
    if (!r.ok) throw new Error('解釈できません');
    expect(r.path.kind).toBe(kind);
    expect(r.path.detected).toBe(detected);
  });
  it('不正なパーセントエンコードの file URL は badUrl', () => {
    expect(parsePath('file:///C:/%E3%81')).toEqual({ ok: false, reason: 'badUrl' });
    expect(parsePath('file:relative')).toEqual({ ok: false, reason: 'badUrl' });
  });
});

describe('Windows のドライブのパス', () => {
  it('各形式へ変換する', () => {
    const v = values('C:\\Users\\me\\a.txt');
    expect(v.windowsBackslash).toBe('C:\\Users\\me\\a.txt');
    expect(v.windowsSlash).toBe('C:/Users/me/a.txt');
    expect(v.wsl).toBe('/mnt/c/Users/me/a.txt');
    expect(v.gitBash).toBe('/c/Users/me/a.txt');
    expect(v.fileUrl).toBe('file:///C:/Users/me/a.txt');
    expect(v.literal).toBe('"C:\\\\Users\\\\me\\\\a.txt"');
    expect(v.bashQuote).toBe('/mnt/c/Users/me/a.txt');
    expect(v.powershellQuote).toBe("'C:\\Users\\me\\a.txt'");
  });
  it('ドライブ文字の大小: Windows は大文字、WSL・Git Bash は小文字', () => {
    expect(values('d:\\x').windowsBackslash).toBe('D:\\x');
    expect(values('d:\\x').wsl).toBe('/mnt/d/x');
    expect(values('/mnt/D/x').windowsBackslash).toBe('D:\\x');
    expect(values('/E/x').gitBash).toBe('/e/x');
  });
  it('末尾の区切りを保つ', () => {
    const v = values('C:\\dir\\');
    expect(v.windowsBackslash).toBe('C:\\dir\\');
    expect(v.windowsSlash).toBe('C:/dir/');
    expect(v.wsl).toBe('/mnt/c/dir/');
    expect(v.fileUrl).toBe('file:///C:/dir/');
  });
  it('ルートだけ', () => {
    for (const input of ['C:\\', 'C:/', 'C:', '/mnt/c', '/mnt/c/', '/c', '/c/']) {
      const v = values(input);
      expect(v.windowsBackslash, input).toBe('C:\\');
      expect(v.windowsSlash, input).toBe('C:/');
      expect(v.wsl, input).toBe('/mnt/c');
      expect(v.gitBash, input).toBe('/c');
      expect(v.fileUrl, input).toBe('file:///C:/');
    }
  });
  it('/ と \\ が混ざっていても受け付ける', () => {
    expect(values('C:\\Users/me\\a').windowsBackslash).toBe('C:\\Users\\me\\a');
  });
  it('連続した区切りは 1 つにまとめる', () => {
    expect(values('C:\\\\a\\\\b').windowsSlash).toBe('C:/a/b');
  });
  it('日本語・空白は file URL でパーセントエンコードし、往復で元に戻る', () => {
    const url = values('C:\\Users\\me\\My Documents\\メモ #1.txt').fileUrl!;
    expect(url).toBe('file:///C:/Users/me/My%20Documents/%E3%83%A1%E3%83%A2%20%231.txt');
    expect(values(url).windowsBackslash).toBe('C:\\Users\\me\\My Documents\\メモ #1.txt');
  });
  it('引用符・前後の空白で囲まれた入力', () => {
    expect(values('  "C:\\a b\\c"  ').windowsSlash).toBe('C:/a b/c');
  });
  it("空白を含むとき bash では '...'、PowerShell は常に '...'", () => {
    const v = values('C:\\a b\\c');
    expect(v.bashQuote).toBe("'/mnt/c/a b/c'");
    expect(v.powershellQuote).toBe("'C:\\a b\\c'");
  });
  it("' を含むとき bash は '\\''、PowerShell は ''", () => {
    const v = values("C:\\it's");
    expect(v.bashQuote).toBe("'/mnt/c/it'\\''s'");
    expect(v.powershellQuote).toBe("'C:\\it''s'");
  });
});

describe('WSL・Git Bash・file URL から Windows へ', () => {
  it('WSL', () => {
    const v = values('/mnt/c/Users/me/');
    expect(v.windowsBackslash).toBe('C:\\Users\\me\\');
    expect(v.gitBash).toBe('/c/Users/me/');
  });
  it('Git Bash', () => {
    expect(values('/c/Users/me').wsl).toBe('/mnt/c/Users/me');
  });
  it('file URL（localhost 付き・ドライブ）', () => {
    expect(values('file://localhost/C:/a/b').windowsBackslash).toBe('C:\\a\\b');
    expect(values('FILE:///C:/a/b').windowsSlash).toBe('C:/a/b');
  });
  it('file URL の WSL パス', () => {
    expect(values('file:///mnt/c/a').windowsBackslash).toBe('C:\\a');
  });
  it('file URL の /c/... は Linux の c フォルダ（Git Bash のドライブにはしない）', () => {
    const v = values('file:///c/a');
    expect(v.windowsBackslash).toBeUndefined();
    expect(v.wsl).toBe('/c/a');
  });
});

describe('UNC', () => {
  it('Windows・Git Bash・file URL へ変換し、WSL は変換できない', () => {
    const result = convertInput('\\\\server\\share\\dir\\メモ.txt');
    if (!result.ok) throw new Error('変換できません');
    const v = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(v.windowsBackslash.value).toBe('\\\\server\\share\\dir\\メモ.txt');
    expect(v.windowsSlash.value).toBe('//server/share/dir/メモ.txt');
    expect(v.gitBash.value).toBe('//server/share/dir/メモ.txt');
    expect(v.fileUrl.value).toBe('file://server/share/dir/%E3%83%A1%E3%83%A2.txt');
    expect(v.wsl.value).toBeUndefined();
    expect(v.wsl.reason).toContain('UNC');
    expect(v.literal.value).toBe('"\\\\\\\\server\\\\share\\\\dir\\\\メモ.txt"');
    expect(v.bashQuote.value).toBe("'//server/share/dir/メモ.txt'");
  });
  it('サーバー名・共有名だけ', () => {
    expect(values('\\\\server').windowsBackslash).toBe('\\\\server');
    expect(values('\\\\server\\share').windowsSlash).toBe('//server/share');
    expect(values('\\\\server\\share\\').fileUrl).toBe('file://server/share');
  });
  it('file URL の往復', () => {
    expect(values('file://server/share/a%20b').windowsBackslash).toBe('\\\\server\\share\\a b');
  });
  it('サーバー名の無い \\\\ だけは相対パス扱い', () => {
    const r = parsePath('\\\\');
    expect(r.ok && r.path.kind).toBe('relative');
  });
});

describe('Linux のパス', () => {
  it('Windows には変換できず、理由を返す', () => {
    const result = convertInput('/home/me/a b');
    if (!result.ok) throw new Error('変換できません');
    const v = Object.fromEntries(result.items.map((i) => [i.id, i]));
    for (const id of ['windowsBackslash', 'windowsSlash', 'gitBash'] as const) {
      expect(v[id].value, id).toBeUndefined();
      expect(v[id].reason, id).toBeTruthy();
    }
    expect(v.wsl.value).toBe('/home/me/a b');
    expect(v.fileUrl.value).toBe('file:///home/me/a%20b');
    expect(v.bashQuote.value).toBe("'/home/me/a b'");
    expect(v.powershellQuote.value).toBe("'/home/me/a b'");
    expect(v.literal.value).toBe('"/home/me/a b"');
  });
  it('ルートと末尾スラッシュ', () => {
    expect(values('/').fileUrl).toBe('file:///');
    expect(values('/home/').wsl).toBe('/home/');
    expect(values('/home/').fileUrl).toBe('file:///home/');
  });
  it('file URL の往復', () => {
    const url = values('/home/me/日本語 dir').fileUrl!;
    expect(url).toBe('file:///home/me/%E6%97%A5%E6%9C%AC%E8%AA%9E%20dir');
    expect(values(url).wsl).toBe('/home/me/日本語 dir');
  });
});

describe('相対パス', () => {
  it('区切りだけ変換し、file URL は変換できない', () => {
    const result = convertInput('src\\app\\main.ts');
    if (!result.ok) throw new Error('変換できません');
    const v = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(v.windowsBackslash.value).toBe('src\\app\\main.ts');
    expect(v.windowsSlash.value).toBe('src/app/main.ts');
    expect(v.wsl.value).toBe('src/app/main.ts');
    expect(v.gitBash.value).toBe('src/app/main.ts');
    expect(v.fileUrl.value).toBeUndefined();
    expect(v.fileUrl.reason).toContain('相対');
    expect(v.literal.value).toBe('"src\\\\app\\\\main.ts"');
    expect(v.powershellQuote.value).toBe("'src\\app\\main.ts'");
  });
  it('/ 区切りの相対パスは、リテラルも / のまま', () => {
    const v = values('../docs/a b.md');
    expect(v.windowsBackslash).toBe('..\\docs\\a b.md');
    expect(v.literal).toBe('"../docs/a b.md"');
    expect(v.bashQuote).toBe("'../docs/a b.md'");
  });
  it('末尾の区切りを保つ', () => {
    expect(values('a\\b\\').windowsSlash).toBe('a/b/');
  });
});

describe('クォート・リテラル', () => {
  it('quoteBash: 安全な文字だけならそのまま', () => {
    expect(quoteBash('/usr/local/bin')).toBe('/usr/local/bin');
    expect(quoteBash('a-b_c.d')).toBe('a-b_c.d');
  });
  it.each([
    ['a b', "'a b'"],
    ['$HOME', "'$HOME'"],
    ['~/x', "'~/x'"],
    ['a;b', "'a;b'"],
    ['日本語', "'日本語'"],
    ["it's", "'it'\\''s'"],
    ['', "''"],
  ])('quoteBash(%j)', (input, expected) => {
    expect(quoteBash(input)).toBe(expected);
  });
  it("quotePowerShell: 常に囲み、中の ' は ''", () => {
    expect(quotePowerShell('C:\\a')).toBe("'C:\\a'");
    expect(quotePowerShell("a'b")).toBe("'a''b'");
  });
  it('quotePowerShell: ‘ ’ ‚ ‛ も重ねる（’ で文字列が終わって別の命令が動かない）', () => {
    expect(quotePowerShell('C:\\tmp\\x’; Write-Output INJECTED; ’')).toBe(
      "'C:\\tmp\\x’’; Write-Output INJECTED; ’’'",
    );
    expect(quotePowerShell('a‘b‚c‛d')).toBe("'a‘‘b‚‚c‛‛d'");
  });
  it('変換結果の PowerShell 用も ’ を重ねる', () => {
    expect(values('C:\\tmp\\x’; Write-Output INJECTED; ’').powershellQuote).toBe(
      "'C:\\tmp\\x’’; Write-Output INJECTED; ’’'",
    );
  });
  it('toStringLiteral: \\ と " をエスケープ', () => {
    expect(toStringLiteral('C:\\a "b"')).toBe('"C:\\\\a \\"b\\""');
  });
});
