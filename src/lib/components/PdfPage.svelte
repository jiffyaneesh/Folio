<script lang="ts">
	import { onDestroy } from 'svelte';
	import { TextLayer } from 'pdfjs-dist';
	import { releaseCanvas } from '../pdf';
	import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
	import type { HighlightRecord } from '../types';

	interface Props {
		doc: PDFDocumentProxy;
		pageNumber: number;
		scale: number;
		width: number; // CSS px target width of the page column
		visible: boolean;
		highlights: HighlightRecord[];
		initialAspect?: number;
		onsize?: (pageNumber: number, height: number) => void;
	}

	let {
		doc,
		pageNumber,
		scale,
		width,
		visible,
		highlights,
		initialAspect = 1.4142,
		onsize
	}: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let textEl: HTMLDivElement | null = $state(null);
	let page: PDFPageProxy | null = null;
	let rendered = false;
	let rendering = false;
	let renderToken = 0;
	let currentRenderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

	let lastRenderedScale = 0;
	let lastRenderedWidth = 0;

	function getAspect() {
		return initialAspect;
	}
	let aspect = $state(getAspect());
	let cssHeight = $derived(Math.round(width * aspect));
	const pageHighlights = $derived(highlights.filter((h) => h.page === pageNumber));

	async function render() {
		if (!visible || !canvas || rendering) return;
		rendering = true;
		const token = ++renderToken;

		try {
			if (!page) {
				page = await doc.getPage(pageNumber);
			}
			if (token !== renderToken || !visible || !canvas) {
				rendering = false;
				return;
			}

			const base = page.getViewport({ scale: 1 });
			const measuredAspect = base.height / base.width;
			if (measuredAspect > 0 && Math.abs(measuredAspect - aspect) > 0.005) {
				aspect = measuredAspect;
				onsize?.(pageNumber, width * aspect);
			}

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const cssScale = (width / base.width) * scale;
			const viewport = page.getViewport({ scale: cssScale * dpr });

			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			canvas.style.width = '100%';
			canvas.style.height = '100%';

			const ctx = canvas.getContext('2d', { alpha: false });
			if (!ctx) {
				rendering = false;
				return;
			}

			currentRenderTask = page.render({
				canvas,
				canvasContext: ctx,
				viewport,
				background: '#ffffff'
			});
			await currentRenderTask.promise;
			currentRenderTask = null;

			if (token !== renderToken || !visible) {
				rendering = false;
				return;
			}

			// Render selectable text layer using standard PDF.js variables
			if (textEl) {
				textEl.replaceChildren();
				const tvp = page.getViewport({ scale: cssScale });
				const textContent = await page.getTextContent();
				if (token === renderToken && textEl && visible) {
					const tl = new TextLayer({
						textContentSource: textContent,
						container: textEl,
						viewport: tvp
					});
					await tl.render();
				}
			}

			lastRenderedScale = scale;
			lastRenderedWidth = width;
			rendered = true;
		} catch (err: unknown) {
			const e = err as { name?: string };
			if (e?.name !== 'RenderingCancelledException') {
				console.warn(`[Folio] Page ${pageNumber} render notice:`, err);
			}
		} finally {
			rendering = false;
		}
	}

	function teardown() {
		renderToken++;
		if (currentRenderTask) {
			try {
				currentRenderTask.cancel();
			} catch {}
			currentRenderTask = null;
		}
		releaseCanvas(canvas);
		textEl?.replaceChildren();
		if (page) {
			try {
				page.cleanup();
			} catch {}
		}
		rendered = false;
		rendering = false;
	}

	// Single reactive effect: render when visible, teardown when out of buffer, re-render on zoom
	$effect(() => {
		const isVis = visible;
		const s = scale;
		const w = width;

		if (isVis) {
			if (!rendered || s !== lastRenderedScale || Math.abs(w - lastRenderedWidth) > 3) {
				render();
			}
		} else {
			if (rendered || rendering) {
				teardown();
			}
		}
	});

	onDestroy(() => {
		teardown();
		page = null;
	});
</script>

<div
	class="pdf-page"
	data-page={pageNumber}
	style="width:{width}px;height:{cssHeight}px;"
>
	<canvas bind:this={canvas} class="pdf-canvas" class:is-hidden={!visible}></canvas>
	<div bind:this={textEl} class="textLayer" class:is-hidden={!visible}></div>

	{#if visible}
		<div class="hl-layer">
			{#each pageHighlights as h (h.id)}
				{#each h.rects as r}
					<div
						class="hl-rect"
						style="left:{r.x * 100}%;top:{r.y * 100}%;width:{r.w * 100}%;height:{r.h *
							100}%;background:{h.color};"
					></div>
				{/each}
			{/each}
		</div>
	{/if}

	{#if !visible}
		<div class="pdf-placeholder">
			<span class="ph-num">Page {pageNumber}</span>
		</div>
	{/if}
</div>

<style>
	.pdf-page {
		position: relative;
		margin: 0 auto 24px;
		border-radius: var(--radius, 10px);
		overflow: hidden;
		background: #ffffff;
		box-shadow: var(--shadow-soft, 0 4px 16px -4px rgba(15, 23, 42, 0.12));
		border: 1px solid var(--border);
		contain: layout paint;
	}
	.pdf-canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #ffffff;
	}
	.is-hidden {
		display: none !important;
	}
	.pdf-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--card);
		border-radius: var(--radius, 10px);
	}
	.ph-num {
		font-size: 13px;
		color: var(--muted-foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-weight: 500;
		letter-spacing: 0.05em;
	}

	/* Official PDF.js TextLayer CSS Variables and Styles */
	.textLayer {
		position: absolute;
		text-align: initial;
		inset: 0;
		overflow: clip;
		opacity: 1;
		line-height: 1;
		letter-spacing: normal;
		word-spacing: normal;
		-webkit-text-size-adjust: none;
		text-size-adjust: none;
		transform-origin: 0 0;
		z-index: 2;
		--min-font-size: 1;
		--text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
		--min-font-size-inv: calc(1 / var(--min-font-size));
	}
	:global(.textLayer :is(span, br)) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0% 0%;
		-webkit-user-select: text;
		user-select: text;
	}
	:global(.textLayer > :not(.markedContent)),
	:global(.textLayer .markedContent span:not(.markedContent)) {
		z-index: 1;
		--font-height: 0;
		font-size: calc(var(--text-scale-factor) * var(--font-height));
		--scale-x: 1;
		--rotate: 0deg;
		transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
	}
	:global(.textLayer ::selection) {
		background: rgba(59, 130, 246, 0.35);
	}
	:global(.textLayer br::selection) {
		background: transparent;
	}

	.hl-layer {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}
	.hl-rect {
		position: absolute;
		border-radius: 3px;
		mix-blend-mode: multiply;
	}
	:global(.dark) .hl-rect {
		mix-blend-mode: normal;
	}
</style>
