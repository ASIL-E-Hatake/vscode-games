import type { FeatureDefinition } from '../../core/feature';
import type { ErrorFile } from '../error-dict/types';
import { discoveryHints, flattenGlossaryFiles, normalizeDiscovered } from './logic';
import { DISCOVERED_KEY } from './service';
import { strings } from './strings';
import type { GlossaryData, GlossaryFile } from './types';

export const feature: FeatureDefinition = {
  id: 'glossary',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'library',
  order: 50,
  tags: ['用語', '図鑑', '辞書', 'glossary', 'コレクション'],
  kind: 'webview',
  initData: ({ app, storage }): GlossaryData => {
    const terms = flattenGlossaryFiles(
      app.content.load<GlossaryFile>('glossary').map((f) => f.data),
    );
    const ids = new Set(terms.map((t) => t.id));
    // 関連する機能のボタン・出会った場所の表示に使う機能名（存在する機能だけ）
    const featureIds = new Set([
      ...terms.flatMap((t) => t.features ?? []),
      'glossary',
      'error-dict',
      'game-typing',
    ]);
    const featureTitles = Object.fromEntries(
      [...featureIds].flatMap((id) => {
        const f = app.registry.get(id);
        return f ? [[id, f.title]] : [];
      }),
    );
    const errorTerms = app.content
      .load<ErrorFile>('errors')
      .flatMap((f) => f.data.errors.map((e) => e.terms ?? []));
    const snippets = app.content
      .load<{ snippets: string[] }>('typing')
      .flatMap((f) => f.data.snippets);
    return {
      terms,
      // 発見の記録は AppServices.glossary（GlossaryService）が同じ保存領域に書く
      discovered: normalizeDiscovered(storage.get<unknown>(DISCOVERED_KEY), ids),
      featureTitles,
      hints: discoveryHints(terms, errorTerms, snippets),
    };
  },
};
