import { liveQuery, type Observable } from 'dexie';
import { db, uid, hashBlob } from './db';
import { schedule } from './sm2';
import type {
	DocumentRecord,
	NoteRecord,
	HighlightRecord,
	FlashcardRecord,
	BookmarkRecord,
	OutlineItem,
	HighlightRect,
	Tab
} from './types';

// ── Core document session state ──────────────────────────────────────────────
class AppState {
	doc = $state<DocumentRecord | null>(null);
	pdfData = $state<Uint8Array | null>(null); // detached-safe copy for PDF.js
	totalPages = $state(0);
	currentPage = $state(1);
	zoom = $state(1);
	outline = $state<OutlineItem[]>([]);
	activeTab = $state<Tab>('notes');
	sessionStart = $state(0);
	loading = $state(false);
	zen = $state(false);
	theme = $state<'light' | 'dark'>('dark');

	get progress(): number {
		if (!this.totalPages) return 0;
		return Math.round((this.currentPage / this.totalPages) * 100);
	}

	toggleTheme() {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
		try {
			localStorage.setItem('folio-theme', this.theme);
			if (this.theme === 'dark') {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		} catch {}
	}

	initTheme() {
		try {
			const saved = localStorage.getItem('folio-theme') as 'light' | 'dark' | null;
			if (saved === 'light' || saved === 'dark') {
				this.theme = saved;
			} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
				this.theme = 'light';
			}
			if (this.theme === 'dark') {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		} catch {}
	}

	reset() {
		this.doc = null;
		this.pdfData = null;
		this.totalPages = 0;
		this.currentPage = 1;
		this.zoom = 1;
		this.outline = [];
		this.sessionStart = 0;
		this.zen = false;
	}
}

export const app = new AppState();

// ── Document loading ─────────────────────────────────────────────────────────
export async function openFile(file: File | Blob, name: string) {
	app.loading = true;
	try {
		const blob = file instanceof Blob ? file : new Blob([file]);
		const id = await hashBlob(blob);
		const existing = await db.documents.get(id);
		const now = Date.now();

		if (existing) {
			existing.lastOpenedAt = now;
			await db.documents.put(existing);
			app.doc = existing;
			app.currentPage = existing.lastPage || 1;
			app.zoom = existing.zoom || 1;
			if (existing.activeTab) app.activeTab = existing.activeTab;
		} else {
			const rec: DocumentRecord = {
				id,
				name,
				blob,
				lastPage: 1,
				totalPages: 0,
				sessionTime: 0,
				addedAt: now,
				lastOpenedAt: now,
				zoom: 1,
				activeTab: 'notes'
			};
			await db.documents.put(rec);
			app.doc = rec;
			app.currentPage = 1;
			app.zoom = 1;
		}

		// Hand PDF.js its own ArrayBuffer copy — it transfers/detaches the buffer.
		app.pdfData = new Uint8Array(await blob.arrayBuffer());
		app.sessionStart = now;
	} finally {
		app.loading = false;
	}
}

export async function persistProgress() {
	if (!app.doc) return;
	const elapsed = app.sessionStart ? Math.floor((Date.now() - app.sessionStart) / 1000) : 0;
	app.doc.lastPage = app.currentPage;
	app.doc.totalPages = app.totalPages;
	app.doc.sessionTime += elapsed;
	app.doc.zoom = app.zoom;
	app.doc.activeTab = app.activeTab;
	app.sessionStart = Date.now();
	await db.documents.put($state.snapshot(app.doc));
}

// ── Live collections (reactive via Dexie liveQuery) ──────────────────────────
export function notesQuery(docId: string): Observable<NoteRecord[]> {
	return liveQuery(() =>
		db.notes.where('docId').equals(docId).reverse().sortBy('createdAt')
	);
}

export function highlightsQuery(docId: string): Observable<HighlightRecord[]> {
	return liveQuery(() =>
		db.highlights.where('docId').equals(docId).reverse().sortBy('createdAt')
	);
}

export function bookmarksQuery(docId: string): Observable<BookmarkRecord[]> {
	return liveQuery(() =>
		db.bookmarks.where('docId').equals(docId).sortBy('page')
	);
}

export function flashcardsQuery(docId: string): Observable<FlashcardRecord[]> {
	return liveQuery(() => db.flashcards.where('docId').equals(docId).toArray());
}

export function recentDocsQuery(): Observable<DocumentRecord[]> {
	return liveQuery(() => db.documents.orderBy('lastOpenedAt').reverse().toArray());
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function addNote(docId: string, page: number, body: string, highlightId?: string) {
	const note: NoteRecord = {
		id: uid(),
		docId,
		page,
		body,
		createdAt: Date.now(),
		highlightId
	};
	await db.notes.add(note);

	// If this note answers a highlight, link it and spawn/refresh a flashcard.
	if (highlightId) {
		await db.highlights.update(highlightId, { noteId: note.id });
		const hl = await db.highlights.get(highlightId);
		if (hl) await upsertFlashcard(hl, body);
	}
	return note;
}

export async function deleteNote(id: string) {
	await db.notes.delete(id);
}

export async function addHighlight(
	docId: string,
	page: number,
	text: string,
	rects: HighlightRect[],
	color = 'rgba(245, 158, 11, 0.35)'
) {
	const hl: HighlightRecord = {
		id: uid(),
		docId,
		page,
		text,
		color,
		rects,
		createdAt: Date.now()
	};
	await db.highlights.add(hl);
	return hl;
}

export async function deleteHighlight(id: string) {
	await db.transaction('rw', db.highlights, db.notes, db.flashcards, async () => {
		await db.highlights.delete(id);
		await db.flashcards.where('highlightId').equals(id).delete();
	});
}

export async function addBookmark(docId: string, page: number, title?: string) {
	const existing = await db.bookmarks.where('docId').equals(docId).filter((b) => b.page === page).first();
	if (existing) return existing;
	const bm: BookmarkRecord = {
		id: uid(),
		docId,
		page,
		title: title || `Page ${page}`,
		createdAt: Date.now()
	};
	await db.bookmarks.add(bm);
	return bm;
}

export async function deleteBookmark(id: string) {
	await db.bookmarks.delete(id);
}

export async function toggleBookmark(docId: string, page: number, title?: string) {
	const existing = await db.bookmarks.where('docId').equals(docId).filter((b) => b.page === page).first();
	if (existing) {
		await db.bookmarks.delete(existing.id);
		return false;
	} else {
		await addBookmark(docId, page, title);
		return true;
	}
}

async function upsertFlashcard(hl: HighlightRecord, back: string) {
	const existing = await db.flashcards.where('highlightId').equals(hl.id).first();
	if (existing) {
		await db.flashcards.update(existing.id, { back, front: hl.text });
		return;
	}
	const card: FlashcardRecord = {
		id: uid(),
		docId: hl.docId,
		highlightId: hl.id,
		front: hl.text,
		back,
		interval: 0,
		repetition: 0,
		easeFactor: 2.5,
		nextReview: Date.now(),
		createdAt: Date.now()
	};
	await db.flashcards.add(card);
}

export async function reviewCard(card: FlashcardRecord, quality: number) {
	const next = schedule(card, quality, Date.now());
	await db.flashcards.put(next);
	return next;
}
