/** Trade and day notes with tags (docs/SPEC.md US-2.8). Searched on the device only. */
import { z } from 'zod';
import type { IstDate } from '../types';

export const NoteSchema = z
  .object({
    id: z.string().min(1).max(100),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('trade'), key: z.string().min(1).max(300) }),
      z.object({ kind: z.literal('day'), date: z.string().regex(/^\d{4}-\d\d-\d\d$/) }),
    ]),
    text: z.string().max(5000),
    tags: z.array(z.string().min(1).max(40)).max(20),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type Note = Omit<z.infer<typeof NoteSchema>, 'target'> & {
  target: { kind: 'trade'; key: string } | { kind: 'day'; date: IstDate };
};

export function parseNote(input: unknown): Note {
  return NoteSchema.parse(input) as Note;
}

/** "#Expiry, revenge" → ['expiry', 'revenge']: lower-case, no '#', no blanks or repeats. */
export function normalizeTags(input: string): string[] {
  const tags = input
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter((t) => t.length > 0);
  return [...new Set(tags)];
}

/** Newest first; `query` matches text (case-insensitive) or, with or without '#', a tag. */
export function searchNotes(notes: readonly Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  const tag = q.replace(/^#/, '');
  return notes
    .filter((n) => q === '' || n.text.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase() === tag))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
