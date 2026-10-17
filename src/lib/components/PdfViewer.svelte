<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { loadDocument, extractOutline, getDocumentBaseAspect, type PDFDocumentProxy } from '../pdf';
	import { app, addHighlight } from '../state.svelte';
	import { search } from '../search.svelte';
	import PdfPage from './PdfPage.svelte';
	import SearchPanel from './SearchPanel.svelte';
	import type { HighlightRecord, HighlightRect } from '../types';

	interface Props {
		highlights: HighlightRecord[];
	}
	let { highlights }: Props = $props();

	let doc = $state<PDFDocumentProxy | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let colWidth = $state(680);
	let documentAspect = $state(1.4142);
	let visiblePages = $state<Set<number>>(new Set([1]));
	let selectionBtn = $state<{ x: number; y: number } | null>(null);
	let pendingSel: { page: number; text: string; rects: HighlightRect[] } | null = null;

	const highlightColors = [
		{ label: 'Amber', color: 'rgba(245, 158, 11, 0.35)', dot: '#f59e0b' },
		{ label: 'Blue', color: 'rgba(59, 130, 246, 0.35)', dot: '#3b82f6' },
		{ label: 'Green', color: 'rgba(16, 185, 129, 0.35)', dot: '#10b981' },
		{ label: 'Pink', color: 'rgba(244, 63, 94, 0.35)', dot: '#f43f5e' }
	];

	const BUNCH_SIZE = 20; // Generous 20 pages before + 20 pages after for buttery smooth scrolling
	const BUNCH_SHIFT_THRESHOLD = 5; // Only slide window when moved >= 5 pages to avoid continuous re-renders
	let lastBunchCenter = 0;
	let isJumping = false;
	let jumpTimeout: ReturnType<typeof setTimeout> | null = null;
	let rafScroll = 0;

	function getPageEl(page: number): HTMLElement | null {
		if (!scrollEl) return null;
		// Fast O(1) direct children lookup
		const direct = scrollEl.children[page - 1] as HTMLElement | undefined;
		if (direct && direct.dataset?.page === String(page)) {
			return direct;
		}
		return scrollEl.querySelector<HTMLElement>(`[data-page="${page}"]`);
	}

	function findCurrentPage(): number {
		if (!scrollEl || !doc || doc.numPages === 0) return 1;
		const targetY = scrollEl.scrollTop + scrollEl.clientHeight * 0.4;
		let low = 1;
		let high = doc.numPages;
		let result = 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const el = getPageEl(mid);
			if (!el) break;

			const top = el.offsetTop;
			const bottom = top + el.offsetHeight + 24;

			if (targetY >= top && targetY < bottom) {
				return mid;
			} else if (targetY < top) {
				high = mid - 1;
				result = mid;
			} else {
				low = mid + 1;
				result = mid;
			}
		}
		return Math.min(Math.max(1, result), doc.numPages);
	}

	function updateBunch(centerPage: number, force = false) {
		if (!doc) return;
		if (!force && Math.abs(centerPage - lastBunchCenter) < BUNCH_SHIFT_THRESHOLD) {
			return;
		}
		lastBunchCenter = centerPage;
		const start = Math.max(1, centerPage - BUNCH_SIZE);
		const end = Math.min(doc.numPages, centerPage + BUNCH_SIZE);

		const next = new Set<number>();
		for (let p = start; p <= end; p++) {
			next.add(p);
		}
		visiblePages = next;
	}

	function scrollTargetIntoView(target: number, behavior: ScrollBehavior) {
		const el = getPageEl(target);
		if (el && scrollEl) {
			const top = Math.max(0, el.offsetTop - 16);
			scrollEl.scrollTo({ top, behavior });
		} else {
			requestAnimationFrame(() => {
				const elRetry = getPageEl(target);
				if (elRetry && scrollEl) {
					const top = Math.max(0, elRetry.offsetTop - 16);
					scrollEl.scrollTo({ top, behavior });
				}
			});
		}
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
		selectionBtn = { x: Math.max(12, r.right - wrap.left), y: r.bottom - wrap.top + scrollEl.scrollTop };
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
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j')
			goTo(app.currentPage + 1);
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k')
			goTo(app.currentPage - 1);
		else if (e.key === '+' || e.key === '=') app.zoom = Math.min(3, app.zoom + 0.1);
		else if (e.key === '-') app.zoom = Math.max(0.5, app.zoom - 0.1);
		else if (e.key === '0') app.zoom = 1;
		else if (e.key.toLowerCase() === 'z') app.zen = !app.zen;
		else return;
		e.preventDefault();
	}

	let lastAvailWidth = 0;
	function measureWidth() {
		if (!scrollEl) return;
		const avail = Math.floor(scrollEl.clientWidth - 48);
		if (Math.abs(avail - lastAvailWidth) > 2) {
			lastAvailWidth = avail;
			colWidth = Math.min(900, Math.max(280, avail)) * app.zoom;
		}
	}

	$effect(() => {
		app.zoom;
		measureWidth();
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

	onDestroy(() => {
		(doc as unknown as { destroy?: () => void })?.destroy?.();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="viewer"
	bind:this={scrollEl}
	onscroll={onScroll}
	onmouseup={onMouseUp}
	role="region"
	aria-label="PDF Document Pages"
>
	{#if doc}
		{#each { length: doc.numPages } as _, i (i)}
			<PdfPage
				{doc}
				pageNumber={i + 1}
				scale={app.zoom}
				width={colWidth}
				initialAspect={documentAspect}
				visible={visiblePages.has(i + 1)}
				priority={Math.abs(i + 1 - app.currentPage) <= 2}
				{highlights}
			/>
		{/each}
	{/if}

	<SearchPanel ongoto={(p) => goTo(p)} />

	{#if selectionBtn}
		<div
			class="hl-palette"
			style="left:{selectionBtn.x}px;top:{selectionBtn.y}px;"
			role="toolbar"
			aria-label="Highlight color selection"
		>
			<span class="hl-label">
				<span class="material-symbols-outlined">ink_highlighter</span>
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
	.hl-label .material-symbols-outlined {
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
