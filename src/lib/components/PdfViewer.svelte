<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { loadDocument, extractOutline, getDocumentBaseAspect, type PDFDocumentProxy } from '../pdf';
	import { app, addHighlight } from '../state.svelte';
	import { search } from '../search.svelte';
	import PdfPage from './PdfPage.svelte';
	import SearchPanel from './SearchPanel.svelte';
	import TtsPlayer from './TtsPlayer.svelte';
	import Icon from './Icon.svelte';
	import { tts } from '../tts.svelte';
	import type { HighlightRecord, HighlightRect } from '../types';

	interface Props {
		highlights: HighlightRecord[];
		onloaded?: (doc: PDFDocumentProxy) => void;
	}
	let { highlights, onloaded }: Props = $props();

	let doc = $state<PDFDocumentProxy | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let colWidth = $state(680);
	let documentAspect = $state(1.4142);
	let visiblePages = $state<Set<number>>(new Set([1]));
	let selectionBtn = $state<{ x: number; y: number } | null>(null);
	let pendingSel: { page: number; text: string; rects: HighlightRect[] } | null = null;

	let spreads = $derived.by(() => {
		if (!doc) return [];
		const list: number[][] = [];
		if (app.spreadMode === 'double') {
			for (let p = 1; p <= doc.numPages; p += 2) {
				if (p + 1 <= doc.numPages) {
					list.push([p, p + 1]);
				} else {
					list.push([p]);
				}
			}
		} else {
			for (let p = 1; p <= doc.numPages; p++) {
				list.push([p]);
			}
		}
		return list;
	});

	const highlightColors = [
		{ label: 'Amber', color: 'rgba(245, 158, 11, 0.35)', dot: '#f59e0b' },
		{ label: 'Blue', color: 'rgba(59, 130, 246, 0.35)', dot: '#3b82f6' },
		{ label: 'Green', color: 'rgba(16, 185, 129, 0.35)', dot: '#10b981' },
		{ label: 'Pink', color: 'rgba(244, 63, 94, 0.35)', dot: '#f43f5e' }
	];

	const BUNCH_SIZE = 2; // 2 pages before + 2 pages after (5 pages max for ultra-low memory)
	const BUNCH_SHIFT_THRESHOLD = 1; // Smoothly slide window with page progression
	let lastBunchCenter = 0;
	let isJumping = false;
	let jumpTimeout: ReturnType<typeof setTimeout> | null = null;
	let rafScroll = 0;

	function findCurrentPage(): number {
		if (!scrollEl || !doc || doc.numPages === 0) return 1;
		const targetY = scrollEl.scrollTop + scrollEl.clientHeight * 0.35;
		const rowHeight = Math.round(colWidth * documentAspect) + 24;
		if (rowHeight > 24) {
			if (app.spreadMode === 'double') {
				const estimatedRow = Math.floor(targetY / rowHeight);
				const estimated = estimatedRow * 2 + 1;
				return Math.min(Math.max(1, estimated), doc.numPages);
			} else {
				const estimated = Math.floor(targetY / rowHeight) + 1;
				return Math.min(Math.max(1, estimated), doc.numPages);
			}
		}
		return 1;
	}

	function updateBunch(centerPage: number, force = false) {
		if (!doc) return;
		if (!force && Math.abs(centerPage - lastBunchCenter) < BUNCH_SHIFT_THRESHOLD) {
			return;
		}
		lastBunchCenter = centerPage;

		const next = new Set<number>();
		if (app.spreadMode === 'double') {
			const centerSpread = Math.floor((centerPage - 1) / 2);
			const startSpread = Math.max(0, centerSpread - BUNCH_SIZE);
			const maxSpread = Math.floor((doc.numPages - 1) / 2);
			const endSpread = Math.min(maxSpread, centerSpread + BUNCH_SIZE);
			for (let s = startSpread; s <= endSpread; s++) {
				const p1 = s * 2 + 1;
				const p2 = s * 2 + 2;
				next.add(p1);
				if (p2 <= doc.numPages) next.add(p2);
			}
		} else {
			const start = Math.max(1, centerPage - BUNCH_SIZE);
			const end = Math.min(doc.numPages, centerPage + BUNCH_SIZE);
			for (let p = start; p <= end; p++) {
				next.add(p);
			}
		}
		visiblePages = next;
	}

	function scrollTargetIntoView(target: number, behavior: ScrollBehavior) {
		if (!scrollEl || !doc) return;
		const rowHeight = Math.round(colWidth * documentAspect) + 24;
		const rowIndex = app.spreadMode === 'double' ? Math.floor((target - 1) / 2) : target - 1;
		const targetTop = Math.max(0, rowIndex * rowHeight);
		scrollEl.scrollTo({ top: targetTop, behavior });
	}

	async function init() {
		if (!app.pdfData) return;
		doc = await loadDocument(app.pdfData);
		app.totalPages = doc.numPages;

		// Extract base aspect ratio from page 1 immediately to eliminate layout jumps
		const baseAspect = await getDocumentBaseAspect(doc);
		documentAspect = baseAspect;
		measureWidth();

		// Extract embedded PDF bookmarks/outline
		extractOutline(doc).then((o) => (app.outline = o));

		onloaded?.(doc);

		// Immediate restoration to saved page with generous bunch lookahead
		const targetPage = Math.min(Math.max(1, app.currentPage), doc.numPages);
		app.currentPage = targetPage;
		updateBunch(targetPage, true);

		requestAnimationFrame(() => {
			scrollTargetIntoView(targetPage, 'auto');
		});
	}

	function onScroll() {
		if (rafScroll) return;
		rafScroll = requestAnimationFrame(() => {
			rafScroll = 0;
			recompute();
		});
	}

	// Determine which page is active via DOM binary search and shift bunch window smoothly
	function recompute() {
		if (!scrollEl || !doc || isJumping) return;
		const current = findCurrentPage();
		if (current !== app.currentPage) {
			app.currentPage = current;
		}
		updateBunch(current, false);
	}

	export function goTo(page: number, behavior: ScrollBehavior = 'smooth') {
		if (!scrollEl || !doc) return;
		const target = Math.min(Math.max(1, page), doc.numPages);
		const distance = Math.abs(target - app.currentPage);
		const effectiveBehavior: ScrollBehavior = distance > 5 ? 'auto' : behavior;

		app.currentPage = target;
		updateBunch(target, true);

		isJumping = true;
		if (jumpTimeout) clearTimeout(jumpTimeout);
		jumpTimeout = setTimeout(() => {
			isJumping = false;
		}, effectiveBehavior === 'smooth' ? 450 : 120);

		scrollTargetIntoView(target, effectiveBehavior);
	}

	// ── Text selection → floating highlight palette ────────────────────────────
	function onMouseUp() {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !sel.toString().trim() || !scrollEl) {
			selectionBtn = null;
			return;
		}
		const range = sel.getRangeAt(0);
		const pageEl = (range.startContainer.parentElement || range.startContainer)
			? findPageEl(range.commonAncestorContainer)
			: null;
		if (!pageEl) {
			selectionBtn = null;
			return;
		}
		const page = Number(pageEl.dataset.page);
		const pageBox = pageEl.getBoundingClientRect();
		const rects: HighlightRect[] = [];
		for (const r of range.getClientRects()) {
			if (r.width < 1 || r.height < 1) continue;
			rects.push({
				x: (r.left - pageBox.left) / pageBox.width,
				y: (r.top - pageBox.top) / pageBox.height,
				w: r.width / pageBox.width,
				h: r.height / pageBox.height
			});
		}
		if (!rects.length) return;
		pendingSel = { page, text: sel.toString().trim(), rects };
		const last = range.getClientRects();
		const r = last[last.length - 1];
		const wrap = scrollEl.getBoundingClientRect();
		const maxX = Math.max(12, wrap.width - 230);
		selectionBtn = {
			x: Math.max(12, Math.min(maxX, r.right - wrap.left)),
			y: r.bottom - wrap.top + scrollEl.scrollTop
		};
	}

	function findPageEl(node: Node): HTMLElement | null {
		let el: HTMLElement | null =
			node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
		while (el && !el.dataset.page) el = el.parentElement;
		return el;
	}

	async function commitHighlight(color = 'rgba(245, 158, 11, 0.35)') {
		if (!pendingSel || !app.doc) return;
		await addHighlight(app.doc.id, pendingSel.page, pendingSel.text, pendingSel.rects, color);
		window.getSelection()?.removeAllRanges();
		selectionBtn = null;
		pendingSel = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
		const step = app.spreadMode === 'double' ? 2 : 1;
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j')
			goTo(app.currentPage + step);
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k')
			goTo(app.currentPage - step);
		else if (e.key === '+' || e.key === '=') app.zoomIn();
		else if (e.key === '-') app.zoomOut();
		else if (e.key === '0') app.resetZoom();
		else if (e.key.toLowerCase() === 'w') app.cycleZoomMode();
		else if (e.key.toLowerCase() === 'z') app.zen = !app.zen;
		else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) app.toggleSpreadMode();
		else return;
		e.preventDefault();
	}

	function measureWidth() {
		if (!scrollEl) return;
		const isDouble = app.spreadMode === 'double';
		const totalAvailW = scrollEl.clientWidth;
		const totalAvailH = scrollEl.clientHeight;
		const availW = isDouble
			? Math.floor((totalAvailW - 64) / 2)
			: Math.floor(totalAvailW - 48);

		if (app.zoomMode === 'fit-width') {
			colWidth = Math.max(240, availW);
		} else if (app.zoomMode === 'fit-page') {
			const availH = Math.max(300, totalAvailH - 120);
			const heightConstrainedW = Math.floor(availH / documentAspect);
			colWidth = Math.max(240, Math.min(availW, heightConstrainedW));
		} else {
			const baseW = Math.min(isDouble ? 800 : 900, Math.max(240, availW));
			colWidth = Math.round(baseW * app.zoom);
		}
	}

	$effect(() => {
		app.zoom;
		app.zoomMode;
		app.spreadMode;
		measureWidth();
		updateBunch(app.currentPage, true);
		requestAnimationFrame(() => {
			scrollTargetIntoView(app.currentPage, 'auto');
		});
	});

	// Build search index lazily on first open
	$effect(() => {
		if (search.open && doc && !search.ready && !search.building) {
			search.build(doc);
		}
	});

	onMount(() => {
		init();
		window.addEventListener('keydown', onKey);
		const ro = new ResizeObserver(() => {
			measureWidth();
			recompute();
		});
		if (scrollEl) ro.observe(scrollEl);
		return () => {
			window.removeEventListener('keydown', onKey);
			ro.disconnect();
		};
	});

	export function toggleTts() {
		tts.toggle(doc, app.currentPage, (p) => goTo(p));
	}

	export function getDoc(): PDFDocumentProxy | null {
		return doc;
	}

	onDestroy(() => {
		tts.stop();
		(doc as unknown as { destroy?: () => void })?.destroy?.();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="viewer"
	bind:this={scrollEl}
	onscroll={onScroll}
	onmouseup={onMouseUp}
	ontouchend={onMouseUp}
	role="region"
	aria-label="PDF Document Pages"
>
	{#if doc}
		<div class="spread-container" class:double={app.spreadMode === 'double'}>
			{#each spreads as spread, sIdx (sIdx)}
				<div class="spread-row">
					{#each spread as pageNum (pageNum)}
						<PdfPage
							{doc}
							pageNumber={pageNum}
							scale={app.zoom}
							width={colWidth}
							initialAspect={documentAspect}
							visible={visiblePages.has(pageNum)}
							priority={Math.abs(pageNum - app.currentPage) <= (app.spreadMode === 'double' ? 3 : 2)}
							{highlights}
						/>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	<SearchPanel ongoto={(p) => goTo(p)} />
	<TtsPlayer {doc} ongoto={(p) => goTo(p)} />

	{#if selectionBtn}
		<div
			class="hl-palette"
			style="left:{selectionBtn.x}px;top:{selectionBtn.y}px;"
			role="toolbar"
			aria-label="Highlight color selection"
		>
			<span class="hl-label">
				<Icon name="ink_highlighter" />
			</span>
			<div class="color-dots">
				{#each highlightColors as c}
					<button
						class="color-dot"
						style="background-color:{c.dot};"
						title={c.label}
						aria-label={`Highlight ${c.label}`}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => commitHighlight(c.color)}
					></button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.viewer {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 32px 24px calc(90px + env(safe-area-inset-bottom));
		position: relative;
		background: var(--reader-bg);
		outline: none;
	}
	.spread-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}
	.spread-row {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}
	.spread-row :global(.pdf-page) {
		margin: 0;
	}
	.hl-palette {
		position: absolute;
		transform: translate(8px, 6px);
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--card);
		color: var(--foreground);
		padding: 6px 10px;
		border-radius: var(--radius, 12px);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-elevated);
		animation: pop 0.15s var(--transition-smooth);
	}
	.hl-label {
		display: flex;
		align-items: center;
		color: var(--muted-foreground);
	}
	.hl-label :global(.material-symbols-outlined) {
		font-size: 16px;
	}
	.color-dots {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.color-dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid rgba(255, 255, 255, 0.4);
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.12s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}
	.color-dot:hover {
		transform: scale(1.22);
		border-color: #ffffff;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(8px, 10px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translate(8px, 6px) scale(1);
		}
	}
</style>
