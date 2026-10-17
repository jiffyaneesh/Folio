<script lang="ts">
	import { onMount } from 'svelte';
	import {
		app,
		persistProgress,
		notesQuery,
		highlightsQuery,
		flashcardsQuery,
		bookmarksQuery,
		toggleBookmark
	} from '$lib/state.svelte';
	import { search } from '$lib/search.svelte';
	import { isDue } from '$lib/sm2';
	import PdfViewer from '$lib/components/PdfViewer.svelte';
	import DetailsPanel from '$lib/components/DetailsPanel.svelte';
	import Library from '$lib/components/Library.svelte';
	import ReviewMode from '$lib/components/ReviewMode.svelte';
	import type { NoteRecord, HighlightRecord, FlashcardRecord, BookmarkRecord } from '$lib/types';

	let view = $state<'library' | 'reader'>('library');
	let reviewing = $state(false);
	let viewer = $state<PdfViewer | null>(null);

	// Mobile bottom-sheet state
	let sheetOpen = $state(false);
	let sheetEl = $state<HTMLElement | null>(null);
	let dragging = false;
	let dragStartY = 0;
	let dragY = $state(0);

	// Quick page jump popover
	let pageInputOpen = $state(false);
	let jumpPage = $state(1);

	function onHandleDown(e: PointerEvent) {
		dragging = true;
		dragStartY = e.clientY;
		dragY = 0;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onHandleMove(e: PointerEvent) {
		if (!dragging) return;
		dragY = Math.max(0, e.clientY - dragStartY);
	}
	function onHandleUp() {
		if (!dragging) return;
		dragging = false;
		const h = sheetEl?.offsetHeight ?? 1;
		if (dragY > h * 0.25) sheetOpen = false;
		dragY = 0;
	}

	let notes = $state<NoteRecord[]>([]);
	let highlights = $state<HighlightRecord[]>([]);
	let flashcards = $state<FlashcardRecord[]>([]);
	let bookmarks = $state<BookmarkRecord[]>([]);

	let now = $state(Date.now());
	const dueCount = $derived(flashcards.filter((c) => isDue(c, now)).length);
	const isCurrentPageBookmarked = $derived(bookmarks.some((b) => b.page === app.currentPage));

	// Re-subscribe live queries whenever the open document changes
	$effect(() => {
		const id = app.doc?.id;
		if (!id) {
			notes = [];
			highlights = [];
			flashcards = [];
			bookmarks = [];
			return;
		}
		const s1 = notesQuery(id).subscribe((v) => (notes = v));
		const s2 = highlightsQuery(id).subscribe((v) => (highlights = v));
		const s3 = flashcardsQuery(id).subscribe((v) => (flashcards = v));
		const s4 = bookmarksQuery(id).subscribe((v) => (bookmarks = v));
		return () => {
			s1.unsubscribe();
			s2.unsubscribe();
			s3.unsubscribe();
			s4.unsubscribe();
		};
	});

	function backToLibrary() {
		persistProgress();
		search.reset();
		app.reset();
		view = 'library';
	}

	function goto(page: number) {
		viewer?.goTo(page);
	}

	async function handleToggleBookmark() {
		if (!app.doc) return;
		await toggleBookmark(app.doc.id, app.currentPage);
	}

	function handleJumpSubmit(e: SubmitEvent) {
		e.preventDefault();
		const p = Math.min(Math.max(1, jumpPage), app.totalPages || 1);
		goto(p);
		pageInputOpen = false;
	}

	onMount(() => {
		app.initTheme();
		const tick = setInterval(() => (now = Date.now()), 30_000);
		const persist = setInterval(() => view === 'reader' && persistProgress(), 15_000);
		const onLeave = () => persistProgress();
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'f' && view === 'reader') {
				e.preventDefault();
				search.open = true;
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && view === 'reader') {
				e.preventDefault();
				handleToggleBookmark();
			} else if (e.key.toLowerCase() === 'z' && view === 'reader' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
				e.preventDefault();
				app.zen = !app.zen;
			}
		};
		window.addEventListener('beforeunload', onLeave);
		window.addEventListener('keydown', onKey);
		document.addEventListener('visibilitychange', () => {
			if (document.hidden) persistProgress();
		});
		return () => {
			clearInterval(tick);
			clearInterval(persist);
			window.removeEventListener('beforeunload', onLeave);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<svelte:head>
	<title>{app.doc ? `${app.doc.name} · Folio` : 'Folio'}</title>
	<meta name="description" content="Folio — a fast, offline-first PDF reader for papers and books." />
</svelte:head>

{#if view === 'library'}
	<Library onopen={() => (view = 'reader')} />
{:else}
	<div class="shell" class:zen={app.zen}>
		{#if !app.zen}
			<header class="toolbar">
				<div class="left">
					<button class="icon" onclick={backToLibrary} aria-label="Back to library" title="Library">
						<span class="material-symbols-outlined">grid_view</span>
					</button>
					<div class="zoom" role="group" aria-label="Zoom controls">
						<button class="zbtn" onclick={() => (app.zoom = Math.max(0.5, app.zoom - 0.1))} aria-label="Zoom out">
							<span class="material-symbols-outlined">remove</span>
						</button>
						<span class="zlevel">{Math.round(app.zoom * 100)}%</span>
						<button class="zbtn" onclick={() => (app.zoom = Math.min(3, app.zoom + 0.1))} aria-label="Zoom in">
							<span class="material-symbols-outlined">add</span>
						</button>
					</div>
					<button
						class="icon bookmark-btn"
						class:active={isCurrentPageBookmarked}
						onclick={handleToggleBookmark}
						aria-label={isCurrentPageBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
						title={isCurrentPageBookmarked ? 'Bookmarked (⌘B)' : 'Bookmark page (⌘B)'}
					>
						<span class="material-symbols-outlined">
							{isCurrentPageBookmarked ? 'bookmark' : 'bookmark_border'}
						</span>
					</button>
				</div>

				<div class="center">
					<h1>{app.doc?.name ?? 'Untitled'}</h1>
					<button
						class="sub-btn"
						onclick={() => {
							jumpPage = app.currentPage;
							pageInputOpen = !pageInputOpen;
						}}
						title="Click to jump to page"
					>
						Page {app.currentPage} of {app.totalPages || '…'}
						<span class="material-symbols-outlined sub-arrow">arrow_drop_down</span>
					</button>

					{#if pageInputOpen}
						<form class="jump-popover" onsubmit={handleJumpSubmit}>
							<label for="jump-input">Jump to page:</label>
							<div class="jump-row">
								<input
									id="jump-input"
									type="number"
									min="1"
									max={app.totalPages || 1}
									bind:value={jumpPage}
								/>
								<button type="submit" class="jump-go">Go</button>
							</div>
						</form>
					{/if}
				</div>

				<div class="right">
					<button
						class="icon"
						class:active={search.open}
						onclick={() => (search.open = !search.open)}
						aria-label="Search document"
						title="Search (⌘F)"
					>
						<span class="material-symbols-outlined">search</span>
					</button>
					<button class="icon" onclick={() => goto(app.currentPage)} aria-label="Recenter" title="Recenter page">
						<span class="material-symbols-outlined">filter_center_focus</span>
					</button>
					<button
						class="icon"
						onclick={() => app.toggleTheme()}
						aria-label="Toggle light or dark theme"
						title={app.theme === 'dark' ? 'Switch to warm light theme' : 'Switch to dark theme'}
					>
						<span class="material-symbols-outlined">
							{app.theme === 'dark' ? 'light_mode' : 'dark_mode'}
						</span>
					</button>
					<button
						class="icon zen-btn"
						onclick={() => (app.zen = true)}
						aria-label="Zen focus mode"
						title="Zen Focus Mode (Z)"
					>
						<span class="material-symbols-outlined">fullscreen</span>
					</button>
					<button
						class="icon panel-toggle"
						class:active={sheetOpen}
						onclick={() => (sheetOpen = !sheetOpen)}
						aria-label="Notes panel"
						title="Notes &amp; highlights"
					>
						<span class="material-symbols-outlined">edit_note</span>
					</button>
				</div>
			</header>
		{/if}

		<main class="work" class:zen={app.zen}>
			<section class="pdf-col" class:full={app.zen}>
				{#if app.pdfData}
					<PdfViewer bind:this={viewer} {highlights} />
				{/if}
			</section>

			{#if !app.zen}
				<div class="divider"></div>
				<div
					class="sheet-backdrop"
					class:show={sheetOpen}
					onclick={() => (sheetOpen = false)}
					role="presentation"
				></div>
				<aside
					class="panel-col"
					class:open={sheetOpen}
					bind:this={sheetEl}
					style={dragY ? `transform:translateY(${dragY}px);transition:none;` : ''}
				>
					<button
						class="sheet-handle"
						aria-label="Drag to close panel"
						onpointerdown={onHandleDown}
						onpointermove={onHandleMove}
						onpointerup={onHandleUp}
						onpointercancel={onHandleUp}
					>
						<span class="grabber"></span>
					</button>
					<DetailsPanel
						{notes}
						{highlights}
						{flashcards}
						{bookmarks}
						{dueCount}
						onreview={() => (reviewing = true)}
						ongoto={goto}
					/>
				</aside>
			{/if}

			{#if app.zen}
				<button
					class="zen-exit"
					onclick={() => (app.zen = false)}
					title="Exit Zen Mode (Z)"
					aria-label="Exit Zen focus mode"
				>
					<span class="material-symbols-outlined">fullscreen_exit</span>
					<span>Exit Focus</span>
				</button>
			{/if}
		</main>
	</div>
{/if}

{#if reviewing}
	<ReviewMode cards={flashcards} onclose={() => (reviewing = false)} />
{/if}

<style>
	.shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		background: var(--background);
		color: var(--foreground);
	}
	.toolbar {
		height: calc(56px + env(safe-area-inset-top));
		padding-top: env(safe-area-inset-top);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-left: calc(16px + env(safe-area-inset-left));
		padding-right: calc(16px + env(safe-area-inset-right));
		background: var(--card);
		border-bottom: 1px solid var(--border);
		box-shadow: var(--shadow-subtle);
		z-index: 30;
		transition: background-color 0.2s var(--transition-smooth);
	}
	.panel-toggle {
		display: none;
	}
	.sheet-handle {
		display: none;
	}
	.sheet-backdrop {
		display: none;
	}
	.left,
	.right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
	}
	.right {
		justify-content: flex-end;
	}
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		padding: 0 12px;
		position: relative;
	}
	.center h1 {
		font-size: 14px;
		font-weight: 500;
		color: var(--foreground);
		margin: 0;
		max-width: 36vw;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub-btn {
		background: none;
		border: none;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--muted-foreground);
		letter-spacing: 0.03em;
		margin-top: 1px;
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 1px 4px;
		border-radius: var(--radius-sm, 4px);
		transition: color 0.15s ease, background 0.15s ease;
	}
	.sub-btn:hover {
		color: var(--foreground);
		background: var(--muted);
	}
	.sub-arrow {
		font-size: 14px;
		margin-left: 2px;
	}
	.jump-popover {
		position: absolute;
		top: 100%;
		margin-top: 6px;
		background: var(--card);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-elevated);
		border-radius: var(--radius, 10px);
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 50;
		animation: drop 0.15s var(--transition-smooth);
	}
	.jump-popover label {
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.jump-row {
		display: flex;
		gap: 6px;
	}
	.jump-row input {
		width: 70px;
		height: 30px;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--foreground);
		padding: 0 8px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 13px;
		outline: none;
	}
	.jump-row input:focus {
		border-color: var(--accent);
	}
	.jump-go {
		height: 30px;
		padding: 0 12px;
		border-radius: var(--radius-sm, 6px);
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		font-size: 12px;
		font-weight: 500;
	}
	.icon {
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md, 8px);
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.icon:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.icon.active {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.bookmark-btn.active {
		color: #f59e0b;
	}
	.icon .material-symbols-outlined {
		font-size: 20px;
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 8px);
		padding: 2px 6px;
	}
	.zbtn {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		padding: 2px;
		border-radius: 4px;
		transition: color 0.15s ease;
	}
	.zbtn:hover {
		color: var(--foreground);
	}
	.zbtn .material-symbols-outlined {
		font-size: 16px;
	}
	.zlevel {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--foreground);
		min-width: 34px;
		text-align: center;
	}
	.work {
		flex: 1;
		display: flex;
		overflow: hidden;
		min-height: 0;
		position: relative;
	}
	.pdf-col {
		width: 58%;
		height: 100%;
		min-width: 0;
		transition: width 0.2s var(--transition-smooth);
	}
	.pdf-col.full {
		width: 100%;
	}
	.divider {
		width: 1px;
		background: var(--border);
	}
	.panel-col {
		width: 42%;
		height: 100%;
		min-width: 0;
	}
	.zen-exit {
		position: fixed;
		top: 16px;
		right: 20px;
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-elevated);
		padding: 8px 14px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		opacity: 0.8;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	.zen-exit:hover {
		opacity: 1;
		transform: translateY(-1px);
	}
	.zen-exit .material-symbols-outlined {
		font-size: 16px;
	}

	@media (max-width: 880px) {
		.work {
			flex-direction: column;
		}
		.pdf-col {
			width: 100%;
			height: 100%;
		}
		.divider {
			display: none;
		}
		.left,
		.right {
			flex: 0 0 auto;
			gap: 4px;
		}
		.center {
			flex: 1 1 auto;
			min-width: 0;
			align-items: flex-start;
			padding: 0 8px;
		}
		.center h1 {
			max-width: 100%;
		}
		.zlevel {
			display: none;
		}
		.zoom {
			padding: 2px 4px;
		}
		.panel-toggle {
			display: flex;
		}
		.zen-btn {
			display: none;
		}
		.sheet-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.45);
			backdrop-filter: blur(2px);
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.25s ease;
			z-index: 55;
		}
		.sheet-backdrop.show {
			opacity: 1;
			pointer-events: auto;
		}
		.panel-col {
			position: fixed;
			inset: auto 0 0 0;
			width: 100%;
			height: min(82dvh, 720px);
			display: flex;
			flex-direction: column;
			transform: translateY(100%);
			transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
			z-index: 60;
			border-radius: var(--radius-xl, 18px) var(--radius-xl, 18px) 0 0;
			overflow: hidden;
			box-shadow: 0 -16px 40px -12px rgba(0, 0, 0, 0.5);
		}
		.panel-col.open {
			transform: translateY(0);
		}
		.sheet-handle {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			height: 28px;
			flex-shrink: 0;
			background: var(--card);
			border: none;
			border-radius: var(--radius-xl, 18px) var(--radius-xl, 18px) 0 0;
			cursor: grab;
			touch-action: none;
		}
		.grabber {
			width: 38px;
			height: 4px;
			border-radius: 999px;
			background: var(--muted-foreground);
			opacity: 0.4;
		}
	}

	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
