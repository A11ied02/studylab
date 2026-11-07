import { CsvPreview, Flashcard } from '../types/flashcards';

/**
 * Robust CSV parser that handles:
 * - RFC 4180 standard CSV
 * - Quoted fields with escaped quotes ("")
 * - Commas inside quoted strings
 * - Multiline rows with newlines inside quotes
 * - Different line breaks (\r\n and \n)
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(field => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Analyzes parsed CSV rows to auto-detect Question and Answer columns
 */
export function analyzeCsv(rows: string[][]): CsvPreview {
  if (rows.length === 0) {
    throw new Error('The CSV file is empty.');
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  if (headerRow.length < 2 && dataRows.length === 0) {
    throw new Error('CSV must contain at least 2 columns (Question and Answer).');
  }

  // Detect column indices based on common header names
  const qMatches = ['question', 'front', 'prompt', 'term', 'q', 'card front', 'concept'];
  const aMatches = ['answer', 'back', 'response', 'definition', 'a', 'card back', 'explanation'];

  let qIndex = headerRow.findIndex(h => qMatches.some(m => h.toLowerCase().includes(m)));
  let aIndex = headerRow.findIndex(h => aMatches.some(m => h.toLowerCase().includes(m)));

  // Fallback defaults: column 0 = Question, column 1 = Answer
  if (qIndex === -1) qIndex = 0;
  if (aIndex === -1 || aIndex === qIndex) {
    aIndex = headerRow.length > 1 ? (qIndex === 0 ? 1 : 0) : 1;
  }

  return {
    headers: headerRow,
    rows: dataRows.slice(0, 10), // first 10 for preview
    detectedQuestionIndex: qIndex,
    detectedAnswerIndex: aIndex,
    totalCards: dataRows.length
  };
}

/**
 * Converts CSV rows to Flashcard objects using specified column indices
 */
export function convertCsvToCards(
  rows: string[][], 
  questionIndex: number, 
  answerIndex: number
): Flashcard[] {
  const dataRows = rows.slice(1);
  const cards: Flashcard[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const front = row[questionIndex]?.trim() || '';
    const back = row[answerIndex]?.trim() || '';

    if (front || back) {
      cards.push({
        id: `card_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        front: front || '(No question)',
        back: back || '(No answer)',
        mastered: false
      });
    }
  }

  return cards;
}
