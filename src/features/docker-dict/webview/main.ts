// Docker 困ったとき辞書の画面。レシピ辞書の共通部品（webview-shared/recipeDict.ts）に文言と分類を渡すだけ
import { mountRecipeDict } from '../../../webview-shared/recipeDict';
import { CATEGORY_LABELS } from '../logic';
import { strings } from '../strings';
import './style.css';

mountRecipeDict({ texts: strings, categories: CATEGORY_LABELS });
