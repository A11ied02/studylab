export interface SourceTextRange {
  start: number;
  end: number;
}

export interface NormalizedSearchText {
  value: string;
  /** One original UTF-16 range for each UTF-16 code unit in value. */
  sourceRanges: SourceTextRange[];
}

const isPunctuationOrSymbol = (value: string) => /[\p{P}\p{S}]/u.test(value);

/** Normalize case, accents, punctuation, and spacing for searchable text. */
export function normalizeSearchText(value: string): string {
  return normalizeSearchTextWithMap(value).value;
}

/** Normalize text while retaining offsets into the original UTF-16 string. */
export function normalizeSearchTextWithMap(value: string): NormalizedSearchText {
  const characters: string[] = [];
  const sourceRanges: SourceTextRange[] = [];
  let sourceOffset = 0;

  for (const sourceCharacter of value) {
    const start = sourceOffset;
    const end = start + sourceCharacter.length;
    sourceOffset = end;

    const normalized = sourceCharacter.normalize('NFD').toLowerCase().replace(/\p{M}/gu, '');
    if (!normalized) {
      const previous = sourceRanges[sourceRanges.length - 1];
      if (previous) previous.end = end;
      continue;
    }

    for (const character of normalized) {
      const outputCharacter = /\s/u.test(character) || isPunctuationOrSymbol(character) ? ' ' : character;
      if (outputCharacter === ' ' && characters[characters.length - 1] === ' ') {
        sourceRanges[sourceRanges.length - 1].end = end;
        continue;
      }

      characters.push(outputCharacter);
      for (let offset = 0; offset < outputCharacter.length; offset += 1) {
        sourceRanges.push({ start, end });
      }
    }
  }

  if (characters[0] === ' ') {
    characters.shift();
    sourceRanges.shift();
  }
  if (characters[characters.length - 1] === ' ') {
    characters.pop();
    sourceRanges.pop();
  }

  return { value: characters.join(''), sourceRanges };
}

/** Find normalized query matches and return their original text offsets. */
export function findNormalizedTextRanges(text: string, query: string): SourceTextRange[] {
  const normalizedText = normalizeSearchTextWithMap(text);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches: SourceTextRange[] = [];
  let searchFrom = 0;
  while (searchFrom <= normalizedText.value.length - normalizedQuery.length) {
    const matchStart = normalizedText.value.indexOf(normalizedQuery, searchFrom);
    if (matchStart < 0) break;
    const firstSourceRange = normalizedText.sourceRanges[matchStart];
    const lastSourceRange = normalizedText.sourceRanges[matchStart + normalizedQuery.length - 1];
    if (firstSourceRange && lastSourceRange) {
      matches.push({ start: firstSourceRange.start, end: lastSourceRange.end });
    }
    searchFrom = matchStart + Math.max(1, normalizedQuery.length);
  }
  return matches;
}

/** Parse an explicit comma-separated list of single-word search terms. */
export function parseCommaSeparatedKeywords(query: string): string[] {
  const parts = query.split(',').map((part) => normalizeSearchText(part));
  if (parts.length < 2 || parts.some((part) => !part || /\s/u.test(part))) return [];
  return [...new Set(parts)];
}
