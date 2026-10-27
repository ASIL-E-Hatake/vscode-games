import { describe, expect, it } from 'vitest';
import { quoteBashLiteral, quotePowerShellLiteral } from './shellQuote';

describe('quotePowerShellLiteral', () => {
  it("必ず '…' で囲み、$・`・\" はそのまま（展開されない）", () => {
    expect(quotePowerShellLiteral('')).toBe("''");
    expect(quotePowerShellLiteral('$env:PATH `n "x"')).toBe("'$env:PATH `n \"x\"'");
  });

  it("' と ‘ ’ ‚ ‛ をすべて 2 つ重ねる", () => {
    expect(quotePowerShellLiteral("it's")).toBe("'it''s'");
    expect(quotePowerShellLiteral('C:\\tmp\\x’; Write-Output INJECTED; ’')).toBe(
      "'C:\\tmp\\x’’; Write-Output INJECTED; ’’'",
    );
    expect(quotePowerShellLiteral('‘‚‛')).toBe("'‘‘‚‚‛‛'");
  });

  it('囲んだ中に、重なっていない引用符が残らない', () => {
    const value = "a'‘’‚‛b''’’";
    const inner = quotePowerShellLiteral(value).slice(1, -1);
    // 先頭から 2 文字ずつ読んで、引用符は必ず同じ文字が 2 つ続く
    for (let i = 0; i < inner.length; i++) {
      if (/['‘’‚‛]/.test(inner[i]!)) {
        expect(inner[i + 1]).toBe(inner[i]);
        i++;
      }
    }
  });
});

describe('quoteBashLiteral', () => {
  it("'…' で囲み、中の ' は '\\'' にする", () => {
    expect(quoteBashLiteral("it's $(rm -rf ~) `x`")).toBe("'it'\\''s $(rm -rf ~) `x`'");
    expect(quoteBashLiteral('')).toBe("''");
  });
});
