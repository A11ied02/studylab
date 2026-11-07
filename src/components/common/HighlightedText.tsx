import React, { useMemo } from 'react';
import { findNormalizedTextRanges, parseCommaSeparatedKeywords } from '../../services/searchText';

interface HighlightedTextProps {
  text: string;
  query: string;
  highlightClassName?: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  query,
  highlightClassName = 'rounded-sm bg-blue-500/25 px-0.5 text-blue-200',
}) => {
  const parts = useMemo<Array<{ text: string; highlighted: boolean }>>(() => {
    const keywords = parseCommaSeparatedKeywords(query);
    const queries = keywords.length ? keywords : [query];
    const ranges = queries.flatMap((term) => findNormalizedTextRanges(text, term))
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .reduce<Array<{ start: number; end: number }>>((merged, range) => {
        const previous = merged[merged.length - 1];
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
        return merged;
      }, []);
    if (!ranges.length) return [{ text, highlighted: false }];

    const result: Array<{ text: string; highlighted: boolean }> = [];
    let cursor = 0;
    ranges.forEach(({ start, end }) => {
      if (start > cursor) result.push({ text: text.slice(cursor, start), highlighted: false });
      result.push({ text: text.slice(start, end), highlighted: true });
      cursor = end;
    });
    if (cursor < text.length) result.push({ text: text.slice(cursor), highlighted: false });
    return result;
  }, [text, query]);

  if (parts.length === 1 && parts[0].text === text && !parts[0].highlighted) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) => part.highlighted
        ? <mark key={`${index}-${part.text}`} className={highlightClassName}>{part.text}</mark>
        : part.text)}
    </>
  );
};
