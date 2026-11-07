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
function findRangesInNormalizedText(normalizedText: NormalizedSearchText, normalizedQuery: string): SourceTextRange[] {
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

/** Find normalized query matches and return their original text offsets. */
export function findNormalizedTextRanges(text: string, query: string): SourceTextRange[] {
  return findRangesInNormalizedText(normalizeSearchTextWithMap(text), normalizeSearchText(query));
}

/** Find and merge the ranges for a query, including comma-separated keyword thresholds. */
export function findSearchTextRanges(text: string, query: string, minKeywordMatches = 1): SourceTextRange[] {
  const keywords = parseCommaSeparatedKeywords(query);
  const normalizedText = normalizeSearchTextWithMap(text);
  let ranges: SourceTextRange[];

  if (keywords.length > 1) {
    const rangesByKeyword = keywords.map((keyword) => findRangesInNormalizedText(normalizedText, keyword));
    const minimum = Math.min(keywords.length, Math.max(1, Math.floor(minKeywordMatches)));
    if (rangesByKeyword.filter((keywordRanges) => keywordRanges.length > 0).length < minimum) return [];
    ranges = rangesByKeyword.flat();
  } else {
    ranges = findRangesInNormalizedText(normalizedText, normalizeSearchText(query));
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  return ranges.reduce<SourceTextRange[]>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

/** Parse an explicit comma-separated list of single-word search terms. */
export function parseCommaSeparatedKeywords(query: string): string[] {
  const parts = query.split(',').map((part) => normalizeSearchText(part));
  if (parts.length < 2 || parts.some((part) => !part || /\s/u.test(part))) return [];
  return [...new Set(parts)];
}

/** Count exact normalized word or phrase occurrences in a text block. */
export function countSearchOccurrences(text: string, query: string): number {
  const words = normalizeSearchText(text).split(' ').filter(Boolean);
  const keywords = parseCommaSeparatedKeywords(query);
  const phrases = keywords.length ? keywords : [normalizeSearchText(query)];
  return phrases.reduce((total, phrase) => {
    const queryWords = phrase.split(' ').filter(Boolean);
    if (!queryWords.length) return total;
    let count = 0;
    for (let start = 0; start <= words.length - queryWords.length; start += 1) {
      if (queryWords.every((word, index) => words[start + index] === word)) count += 1;
    }
    return total + count;
  }, 0);
}
