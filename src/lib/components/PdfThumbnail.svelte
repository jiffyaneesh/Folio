<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
	import Icon from './Icon.svelte';

	interface Props {
		doc: PDFDocumentProxy;
		pageNumber: number;
		active: boolean;
		bookmarked: boolean;
		aspect: number;
		onclick: () => void;
	}

	let { doc, pageNumber, active, bookmarked, aspect = 1.4142, onclick }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let isVisible = $state(false);
	let imgUrl = $state<string | null>(null);
	let loading = $state(false);
	let observer: IntersectionObserver | null = null;
	let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

	// Global session-level thumbnail LRU cache to avoid re-rendering pages already drawn
	const thumbCache = (window as unknown as { __folioThumbCache?: Map<string, string> }).__folioThumbCache ??= new Map<string, string>();

	async function renderThumb() {
		if (loading || imgUrl) return;
		const cacheKey = `${doc.loadingTask?.docId ?? 'doc'}-${pageNumber}`;
		if (thumbCache.has(cacheKey)) {
			imgUrl = thumbCache.get(cacheKey)!;
			return;
		}

		loading = true;
		let page: PDFPageProxy | null = null;
		let canvas: HTMLCanvasElement | null = null;

		try {
			page = await doc.getPage(pageNumber);
			const unscaledViewport = page.getViewport({ scale: 1.0 });
			const targetWidth = 110;
			const scale = targetWidth / unscaledViewport.width;
			const viewport = page.getViewport({ scale });

			canvas = document.createElement('canvas');
			canvas.width = Math.round(viewport.width);
			canvas.height = Math.round(viewport.height);

			const ctx = canvas.getContext('2d', { alpha: false });
			if (!ctx) return;

			renderTask = page.render({
				canvasContext: ctx,
				viewport,
				canvas
			});

			await renderTask.promise;
			const url = canvas.toDataURL('image/webp', 0.65);
			thumbCache.set(cacheKey, url);
			imgUrl = url;
		} catch (e: unknown) {
			const err = e as { name?: string };
			if (err?.name !== 'RenderingCancelledException') {
				// Fallback or ignore cancelled renders
			}
		} finally {
			loading = false;
			renderTask = null;
			if (canvas) {
				canvas.width = 0;
				canvas.height = 0;
				canvas = null;
			}
			if (page) {
				page.cleanup();
			}
		}
	}

	onMount(() => {
		if (!containerEl) return;
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						isVisible = true;
						renderThumb();
						if (observer && containerEl) {
							observer.unobserve(containerEl);
						}
					}
				}
			},
			{ rootMargin: '160px' }
		);
		observer.observe(containerEl);

		return () => {
			if (observer) observer.disconnect();
			if (renderTask) {
				try {
					renderTask.cancel();
				} catch {}
			}
		};
	});

	onDestroy(() => {
		if (renderTask) {
			try {
				renderTask.cancel();
			} catch {}
		}
	});
</script>

<div
	bind:this={containerEl}
	class="thumb-item"
	class:active
	class:bookmarked
	onclick={onclick}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onclick()}
	role="button"
	tabindex="0"
	aria-label={`Jump to page ${pageNumber}`}
>
	<div class="thumb-frame" style="aspect-ratio: 1 / {aspect};">
		{#if imgUrl}
			<img src={imgUrl} alt={`Page ${pageNumber}`} class="thumb-img" loading="lazy" />
		{:else}
			<div class="thumb-placeholder">
				<span class="ph-text">{pageNumber}</span>
			</div>
		{/if}

		{#if bookmarked}
			<div class="bm-badge" title="Bookmarked page">
				<Icon name="bookmark" />
			</div>
		{/if}
	</div>
	<span class="thumb-num">{pageNumber}</span>
</div>

<style>
	.thumb-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm, 6px);
		transition: transform 0.12s ease;
		background: none;
		border: none;
		outline: none;
	}
	.thumb-item:hover {
		transform: translateY(-2px);
	}
	.thumb-frame {
		position: relative;
		width: 100%;
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		background: #ffffff;
		border: 1.5px solid var(--border);
		box-shadow: var(--shadow-subtle, 0 1px 3px rgba(0, 0, 0, 0.08));
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.thumb-item:hover .thumb-frame {
		border-color: var(--accent);
		box-shadow: var(--shadow-soft, 0 3px 8px rgba(0, 0, 0, 0.12));
	}
	.thumb-item.active .thumb-frame {
		border-color: var(--accent) !important;
		box-shadow: 0 0 0 2px var(--accent), 0 4px 12px rgba(245, 158, 11, 0.25) !important;
	}
	.thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--muted);
		color: var(--muted-foreground);
	}
	.ph-text {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 13px;
		font-weight: 500;
	}
	.bm-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		color: var(--accent);
		line-height: 1;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
	}
	.bm-badge :global(.material-symbols-outlined) {
		font-size: 16px;
	}
	.thumb-num {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		font-weight: 500;
		color: var(--muted-foreground);
		transition: color 0.12s ease;
	}
	.thumb-item.active .thumb-num {
		color: var(--accent);
		font-weight: 600;
	}
</style>
