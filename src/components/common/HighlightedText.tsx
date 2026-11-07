import React, { useMemo } from 'react';

interface HighlightedTextProps {
  text: string;
  query: string;
  highlightClassName?: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  query,
  highlightClassName = 'rounded-sm bg-blue-500/25 px-0.5 text-blue-200',
}) => {
  const parts = useMemo(() => {
    const words = [...new Set(query.match(/[\p{L}\p{N}]+/gu) ?? [])]
      .sort((a, b) => b.length - a.length);
    if (!words.length) return [text];

    const matcher = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'giu');
    return text.split(matcher);
  }, [text, query]);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) => index % 2 === 1
        ? <mark key={`${index}-${part}`} className={highlightClassName}>{part}</mark>
        : part)}
    </>
  );
};
