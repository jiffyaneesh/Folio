import type { PDFDocumentProxy } from './pdf';

export interface SearchHit {
	page: number;
	snippet: string;
}

interface PageDoc {
	id: number;
	text: string;
}

class SearchState {
	open = $state(false);
	query = $state('');
	hits = $state<SearchHit[]>([]);
	building = $state(false);
	ready = $state(false);
	progress = $state(0); // 0 to 100%

	#worker: Worker | null = null;
	#queryId = 0;
	#buildToken = 0;

	constructor() {
		this.#initWorker();
	}

	#initWorker() {
		if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
		try {
			this.#worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
				type: 'module'
			});

			this.#worker.onmessage = (e: MessageEvent) => {
				const data = e.data;
				if (!data) return;

				if (data.type === 'READY') {
					this.ready = true;
					this.building = false;
					this.progress = 100;
					if (this.query.trim().length >= 2) {
						this.run();
					}
				} else if (data.type === 'SEARCH_RESULTS') {
					if (data.queryId === this.#queryId) {
						this.hits = data.hits || [];
					}
				}
			};
		} catch (err) {
			console.warn('[Folio] Could not initialize search worker:', err);
		}
	}

	reset() {
		this.open = false;
		this.query = '';
		this.hits = [];
		this.building = false;
		this.ready = false;
		this.progress = 0;
		this.#buildToken++;
		if (this.#worker) {
			this.#worker.postMessage({ type: 'INIT' });
		}
	}

	async build(doc: PDFDocumentProxy) {
		if (this.ready || this.building) return;
		this.building = true;
		this.progress = 0;
		const token = ++this.#buildToken;

		if (!this.#worker) {
			this.#initWorker();
		}

		this.#worker?.postMessage({ type: 'INIT' });

		const totalPages = doc.numPages;
		const BATCH_SIZE = 8;
		let batch: PageDoc[] = [];

		for (let p = 1; p <= totalPages; p++) {
			if (token !== this.#buildToken) return;

			try {
				const page = await doc.getPage(p);
				const content = await page.getTextContent();
				const text = content.items
					.map((it) => ('str' in it ? it.str : ''))
					.join(' ')
					.replace(/\s+/g, ' ')
					.trim();
				batch.push({ id: p, text });
				page.cleanup();
			} catch (err) {
				console.warn(`[Folio] Could not extract text for page ${p}:`, err);
			}

			// Send in small batches and yield to event loop so UI never stutters
			if (batch.length >= BATCH_SIZE || p === totalPages) {
				this.#worker?.postMessage({ type: 'ADD_PAGES', pages: batch });
				batch = [];
				this.progress = Math.round((p / totalPages) * 100);
				// Micro-pause to yield main thread to user interactions/animations
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		if (token === this.#buildToken) {
			this.#worker?.postMessage({ type: 'FINISH_BUILD' });
		}
	}

	run() {
		const q = this.query.trim();
		if (q.length < 2) {
			this.hits = [];
			return;
		}

		const queryId = ++this.#queryId;
		if (this.#worker && this.ready) {
			this.#worker.postMessage({ type: 'SEARCH', query: q, queryId });
		}
	}
}

export const search = new SearchState();
