import Dexie, { type Table } from 'dexie';
import type {
	DocumentRecord,
	DocumentFileRecord,
	NoteRecord,
	HighlightRecord,
	FlashcardRecord,
	BookmarkRecord
} from './types';

class FolioDB extends Dexie {
	documents!: Table<DocumentRecord, string>;
	files!: Table<DocumentFileRecord, string>;
	notes!: Table<NoteRecord, string>;
	highlights!: Table<HighlightRecord, string>;
	flashcards!: Table<FlashcardRecord, string>;
	bookmarks!: Table<BookmarkRecord, string>;

	constructor() {
		super('folio');
		this.version(1).stores({
			documents: 'id, lastOpenedAt, addedAt',
			notes: 'id, docId, page, createdAt',
			highlights: 'id, docId, page, createdAt',
			flashcards: 'id, docId, highlightId, nextReview'
		});
		this.version(2).stores({
			bookmarks: 'id, docId, page, createdAt'
		});
		this.version(3)
			.stores({
				files: 'id'
			})
			.upgrade(async (tx) => {
				await tx
					.table('documents')
					.toCollection()
					.modify((doc: Record<string, unknown>) => {
						if (doc.blob) {
							tx.table('files').put({ id: doc.id, blob: doc.blob });
							delete doc.blob;
						}
					});
			});
	}
}

export const db = new FolioDB();

// crypto.randomUUID is available in all evergreen browsers + secure contexts.
export const uid = (): string => crypto.randomUUID();

// Stable content hash for a PDF so reopening the same file restores its state.
export async function hashBlob(blob: Blob): Promise<string> {
	const buf = await blob.arrayBuffer();
	// Hash a bounded prefix + size for speed on huge files; collisions negligible.
	const slice = buf.byteLength > 1_048_576 ? buf.slice(0, 1_048_576) : buf;
	const digest = await crypto.subtle.digest('SHA-256', slice);
	const bytes = new Uint8Array(digest);
	let hex = '';
	for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
	return `${hex.slice(0, 32)}-${buf.byteLength}`;
}
