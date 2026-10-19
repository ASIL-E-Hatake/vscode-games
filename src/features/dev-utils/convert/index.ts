import { base64Decode, base64Encode } from './base64';
import { countText } from './count';
import { jsonFormat, jsonMinify } from './json';
import { javaLiteral, javascriptLiteral, jsonLiteral, pythonLiteral } from './literal';
import { camelCase, kebabCase, pascalCase, screamingSnakeCase, snakeCase } from './naming';
import { convertRadix } from './radix';
import { convertTime } from './time';
import type { ConvertResult } from './types';
import { urlDecode, urlEncode } from './url';
import { toFullWidth, toHalfWidth } from './width';

/** 変換の ID（画面の一覧の順） */
export const CONVERSION_IDS = [
  'base64-encode',
  'base64-decode',
  'url-encode',
  'url-decode',
  'json-format',
  'json-minify',
  'literal-java',
  'literal-python',
  'literal-javascript',
  'literal-json',
  'name-camel',
  'name-pascal',
  'name-snake',
  'name-screaming',
  'name-kebab',
  'width-half',
  'width-full',
  'time',
  'radix-2',
  'radix-8',
  'radix-10',
  'radix-16',
  'count',
] as const;
export type ConversionId = (typeof CONVERSION_IDS)[number];

export const converters: Record<ConversionId, (input: string) => ConvertResult> = {
  'base64-encode': base64Encode,
  'base64-decode': base64Decode,
  'url-encode': urlEncode,
  'url-decode': urlDecode,
  'json-format': jsonFormat,
  'json-minify': jsonMinify,
  'literal-java': javaLiteral,
  'literal-python': pythonLiteral,
  'literal-javascript': javascriptLiteral,
  'literal-json': jsonLiteral,
  'name-camel': camelCase,
  'name-pascal': pascalCase,
  'name-snake': snakeCase,
  'name-screaming': screamingSnakeCase,
  'name-kebab': kebabCase,
  'width-half': toHalfWidth,
  'width-full': toFullWidth,
  time: (input) => convertTime(input),
  'radix-2': (input) => convertRadix(input, 2),
  'radix-8': (input) => convertRadix(input, 8),
  'radix-10': (input) => convertRadix(input, 10),
  'radix-16': (input) => convertRadix(input, 16),
  count: countText,
};
