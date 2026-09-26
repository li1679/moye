export type EditableChapter = {
  id?: string;
  name: string;
  body: string;
};

export type Chapter = EditableChapter & Record<string, unknown>;

export type Book = {
  id: number;
  name: string;
  author: string;
  chapters: Chapter[];
  [key: string]: unknown;
};
