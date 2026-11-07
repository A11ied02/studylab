import { BookFolder, Subject } from '../types/library';

export const SUBJECT_ORDER = [
  "Science",
  "Maths",
  "Social Science",
  "English",
  "Hindi",
  "IT"
] as const;

export type SubjectOrderType = typeof SUBJECT_ORDER[number];

/**
 * Returns the 0-based priority index according to SUBJECT_ORDER.
 * Returns 999 for unknown subjects so they sort to the end gracefully.
 */
export function getSubjectPriority(displayName: string): number {
  const clean = displayName.trim();
  const index = SUBJECT_ORDER.indexOf(clean as SubjectOrderType);
  if (index !== -1) return index;

  // Handle case-insensitive or partial match
  const lower = clean.toLowerCase();
  const foundIndex = SUBJECT_ORDER.findIndex(s => s.toLowerCase() === lower);
  return foundIndex !== -1 ? foundIndex : 999;
}

/**
 * Centralized sorter for subjects according to SUBJECT_ORDER.
 * Respects foldernamemap display names and preserves strict order:
 * 1. Science
 * 2. Maths
 * 3. Social Science
 * 4. English
 * 5. Hindi
 * 6. IT
 */
export function sortSubjects<T extends { displayName: string }>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) => {
    const priorityA = getSubjectPriority(a.displayName);
    const priorityB = getSubjectPriority(b.displayName);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}
