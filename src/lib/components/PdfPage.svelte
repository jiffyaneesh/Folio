<script lang="ts">
	import { onDestroy, tick } from 'svelte';
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

	let { doc, pageNumber, scale, width, visible, highlights, initialAspect = 1.4142, onsize }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let textEl = $state<HTMLDivElement | null>(null);
	let page: PDFPageProxy | null = null;
	let rendered = $state(false);
	let rendering = false;
	let renderToken = 0;
	let currentRenderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
	function getAspect() {
		return initialAspect;
	}
	let aspect = $state(getAspect());
	let cssHeight = $derived(width * aspect);

	const pageHighlights = $derived(highlights.filter((h) => h.page === pageNumber));

	async function render() {
		if (!visible || rendered || rendering || !canvas) return;
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

			canvas.width = viewport.width;
			canvas.height = viewport.height;
			canvas.style.width = '100%';
			canvas.style.height = '100%';

			const ctx = canvas.getContext('2d', { alpha: false });
			if (!ctx) {
				rendering = false;
				return;
			}

			// Render canvas bitmap
			currentRenderTask = page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' });
			await currentRenderTask.promise;
			currentRenderTask = null;

			if (token !== renderToken || !visible) {
				rendering = false;
				return;
			}

			// Render selectable text layer
			if (textEl) {
				textEl.replaceChildren();
				const tvp = page.getViewport({ scale: cssScale });
				const textContent = await page.getTextContent();
				if (token === renderToken && textEl) {
					const tl = new TextLayer({
						textContentSource: textContent,
						container: textEl,
						viewport: tvp
					});
					await tl.render();
				}
			}

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
			page.cleanup();
		}
		rendered = false;
		rendering = false;
	}

	// Trigger render when visible and canvas is mounted; release when out of viewport
	$effect(() => {
		if (visible && canvas && !rendered && !rendering) {
			tick().then(render);
		} else if (!visible && (rendered || rendering)) {
			teardown();
		}
	});

	// Re-render when zoom/width changes while visible
	$effect(() => {
		scale;
		width;
		if (visible && canvas && rendered && !rendering) {
			rendered = false;
			tick().then(render);
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
	{#if visible}
		<canvas bind:this={canvas} class="pdf-canvas"></canvas>
		<div bind:this={textEl} class="text-layer"></div>
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
	{:else}
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
		transition: box-shadow 0.2s ease;
	}
	.pdf-canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #ffffff;
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
	.text-layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		line-height: 1;
		opacity: 1;
		z-index: 2;
		color: transparent;
	}
	:global(.text-layer span) {
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0 0;
		color: transparent;
	}
	:global(.text-layer ::selection) {
		background: rgba(59, 130, 246, 0.35);
	}
	:global(.text-layer br::selection) {
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
