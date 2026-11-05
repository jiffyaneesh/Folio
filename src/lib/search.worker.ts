import MiniSearch from 'minisearch';

interface PageDoc {
	id: number; // page number
	text: string;
}

export interface SearchHit {
	page: number;
	snippet: string;
}

let index: MiniSearch<PageDoc> | null = null;
const pageText = new Map<number, string>();

function initIndex() {
	index = new MiniSearch<PageDoc>({
		fields: ['text'],
		storeFields: [],
		searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND' }
	});
	pageText.clear();
}

function snippet(text: string, query: string): string {
	const term = query.split(/\s+/)[0]?.toLowerCase() || '';
	const i = text.toLowerCase().indexOf(term);
	if (i < 0) return text.slice(0, 90) + (text.length > 90 ? '…' : '');
	const start = Math.max(0, i - 40);
	const end = Math.min(text.length, i + term.length + 50);
	return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

self.onmessage = (e: MessageEvent) => {
	const data = e.data;
	if (!data) return;

	switch (data.type) {
		case 'INIT': {
			initIndex();
			self.postMessage({ type: 'INIT_DONE' });
			break;
		}

		case 'ADD_PAGES': {
			const pages = data.pages as PageDoc[];
			if (!index) initIndex();
			if (pages && pages.length && index) {
				for (const p of pages) {
					pageText.set(p.id, p.text);
				}
				index.addAll(pages);
			}
			self.postMessage({ type: 'PAGES_ADDED', count: pages.length });
			break;
		}

		case 'FINISH_BUILD': {
			self.postMessage({ type: 'READY' });
			break;
		}

		case 'SEARCH': {
			const query = (data.query as string).trim();
			const queryId = data.queryId as number;

			if (!index || query.length < 2) {
				self.postMessage({ type: 'SEARCH_RESULTS', queryId, hits: [] });
				return;
			}

			const results = index.search(query).slice(0, 50);
			const hits: SearchHit[] = results.map((r) => ({
				page: r.id as number,
				snippet: snippet(pageText.get(r.id as number) ?? '', query)
			}));

			self.postMessage({ type: 'SEARCH_RESULTS', queryId, hits });
			break;
		}
	}
};
