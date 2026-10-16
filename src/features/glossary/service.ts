// 技術用語図鑑の発見の記録（ホスト側）。AppServices.glossary として全機能から使う。
// VS Code API に直接依存しない（保存は ScopedStorage、通知は onDiscovered で受け取る）
import type { ContentStore } from '../../core/contentStore';
import type { TermDiscovery } from '../../core/feature';
import type { ScopedStorage } from '../../core/storage';
import { applyDiscovery, flattenGlossaryFiles, normalizeDiscovered, termsInText } from './logic';
import type { DiscoveredMap, GlossaryFile, GlossaryTerm } from './types';

/** 発見の記録を保存するキー（glossary の保存領域） */
export const DISCOVERED_KEY = 'discovered';

export class GlossaryService implements TermDiscovery {
  private cache: { terms: GlossaryTerm[]; ids: Set<string> } | undefined;

  constructor(
    /** glossary の保存領域（hatake-gottani.glossary.*） */
    private readonly storage: ScopedStorage,
    private readonly content: Pick<ContentStore, 'load'>,
    /** 記録が変わったとき（表示の更新用）。added は新しく発見した用語 */
    private readonly onChanged: (added: GlossaryTerm[]) => void = () => undefined,
  ) {}

  terms(): GlossaryTerm[] {
    return this.load().terms;
  }

  private load(): { terms: GlossaryTerm[]; ids: Set<string> } {
    if (!this.cache) {
      const terms = flattenGlossaryFiles(
        this.content.load<GlossaryFile>('glossary').map((f) => f.data),
      );
      this.cache = { terms, ids: new Set(terms.map((t) => t.id)) };
    }
    return this.cache;
  }

  /** 発見の記録（存在する用語だけ） */
  discovered(): DiscoveredMap {
    return normalizeDiscovered(this.storage.get<unknown>(DISCOVERED_KEY), this.load().ids);
  }

  async discover(source: string, termIds: readonly string[], at = new Date()): Promise<string[]> {
    const { terms, ids } = this.load();
    const result = applyDiscovery(this.discovered(), termIds, source, ids, at);
    if (!result.changed) return [];
    await this.storage.set(DISCOVERED_KEY, result.discovered);
    this.onChanged(terms.filter((t) => result.added.includes(t.id)));
    return result.added;
  }

  async discoverInText(source: string, text: string): Promise<string[]> {
    const found = termsInText(this.terms(), text);
    return found.length > 0 ? this.discover(source, found) : [];
  }
}
