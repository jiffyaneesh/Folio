<script lang="ts">
	import { app, addNote, deleteNote, deleteHighlight, deleteBookmark } from '../state.svelte';
	import { relTime } from '../time';
	import SessionTimer from './SessionTimer.svelte';
	import Icon from './Icon.svelte';
	import PdfThumbnail from './PdfThumbnail.svelte';
	import type { PDFDocumentProxy } from '../pdf';
	import type { NoteRecord, HighlightRecord, FlashcardRecord, BookmarkRecord, Tab } from '../types';

	interface Props {
		doc?: PDFDocumentProxy | null;
		notes: NoteRecord[];
		highlights: HighlightRecord[];
		flashcards: FlashcardRecord[];
		bookmarks: BookmarkRecord[];
		dueCount: number;
		onreview: () => void;
		ongoto: (page: number) => void;
	}
	let {
		doc = null,
		notes,
		highlights,
		flashcards,
		bookmarks,
		dueCount,
		onreview,
		ongoto
	}: Props = $props();

	let draft = $state('');
	let replyTo = $state<HighlightRecord | null>(null);

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'notes', label: 'Notes' },
		{ id: 'highlights', label: 'Highlights' },
		{ id: 'bookmarks', label: 'Bookmarks' },
		{ id: 'outline', label: 'Outline' },
		{ id: 'thumbnails', label: 'Pages' }
	];

	let outlineFilter = $state('');
	const filteredOutline = $derived(
		outlineFilter.trim()
			? app.outline.filter((item) =>
					item.title.toLowerCase().includes(outlineFilter.toLowerCase().trim())
				)
			: app.outline
	);

	const counts = $derived<Record<Tab, number>>({
		notes: notes.length,
		highlights: highlights.length,
		bookmarks: bookmarks.length,
		outline: app.outline.length,
		thumbnails: app.totalPages
	});

	async function submit() {
		const body = draft.trim();
		if (!body || !app.doc) return;
		await addNote(app.doc.id, app.currentPage, body, replyTo?.id);
		draft = '';
		replyTo = null;
	}

	function startReply(h: HighlightRecord) {
		replyTo = h;
		app.activeTab = 'notes';
		document.getElementById('composer')?.focus();
	}

	function onListClick(e: MouseEvent) {
		const el = (e.target as HTMLElement).closest('[data-page]') as HTMLElement | null;
		const action = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
		if (action) {
			e.stopPropagation();
			const id = action.dataset.id!;
			if (action.dataset.action === 'del-note') deleteNote(id);
			else if (action.dataset.action === 'del-hl') deleteHighlight(id);
			else if (action.dataset.action === 'del-bm') deleteBookmark(id);
			else if (action.dataset.action === 'reply') {
				const h = highlights.find((x) => x.id === id);
				if (h) startReply(h);
			}
			return;
		}
		if (el?.dataset.page) {
			const page = Number(el.dataset.page);
			const hlId = el.dataset.hlId;
			if (hlId) {
				app.pulseHighlight(hlId);
			}
			ongoto(page);
		}
	}

	function onListKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			const target = (e.target as HTMLElement).closest('[data-page]') as HTMLElement | null;
			if (target?.dataset.page) {
				e.preventDefault();
				const hlId = target.dataset.hlId;
				if (hlId) {
					app.pulseHighlight(hlId);
				}
				ongoto(Number(target.dataset.page));
			}
		}
	}

	const colorCategories = [
		{ id: 'all', label: 'All', color: '' },
		{ id: '245', label: 'Ideas', color: '#f59e0b' },
		{ id: '59', label: 'Facts', color: '#3b82f6' },
		{ id: '16', label: 'Quotes', color: '#10b981' },
		{ id: '244', label: 'Questions', color: '#f43f5e' }
	];
	let activeColorFilter = $state<string>('all');

	function getCategoryLabel(color: string): string {
		if (color.includes('245')) return 'Idea';
		if (color.includes('59')) return 'Fact';
		if (color.includes('16')) return 'Quote';
		if (color.includes('244')) return 'Question';
		return 'Highlight';
	}

	function getCategoryColor(color: string): string {
		if (color.includes('245')) return '#f59e0b';
		if (color.includes('59')) return '#3b82f6';
		if (color.includes('16')) return '#10b981';
		if (color.includes('244')) return '#f43f5e';
		return '#f59e0b';
	}

	const countsByColor = $derived<Record<string, number>>({
		all: highlights.length,
		'245': highlights.filter((h) => h.color.includes('245')).length,
		'59': highlights.filter((h) => h.color.includes('59')).length,
		'16': highlights.filter((h) => h.color.includes('16')).length,
		'244': highlights.filter((h) => h.color.includes('244')).length
	});

	const filteredHighlights = $derived(
		activeColorFilter === 'all'
			? highlights
			: highlights.filter((h) => h.color.includes(activeColorFilter))
	);

	let exportMenuOpen = $state(false);

	function downloadFile(content: string, filename: string, mime: string) {
		const blob = new Blob([content], { type: `${mime};charset=utf-8` });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
		exportMenuOpen = false;
	}

	function sanitizeFileName(name: string) {
		return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
	}

	function exportObsidianMarkdown() {
		if (!app.doc) return;
		const baseName = sanitizeFileName(app.doc.name);
		const dateStr = new Date().toISOString().slice(0, 10);

		let md = `---
title: "${app.doc.name.replace(/"/g, '\\"')}"
source: "Folio"
date: ${dateStr}
total_pages: ${app.totalPages}
progress: ${app.progress}%
tags:
  - reading
  - research
  - folio
---

# ${app.doc.name}

> [!info] Document Metadata
> - **Total Pages**: ${app.totalPages}
> - **Reading Progress**: ${app.progress}%
> - **Highlights Count**: ${highlights.length}
> - **Notes Count**: ${notes.length}
> - **Flashcards Count**: ${flashcards.length}
> - **Exported Date**: ${dateStr}

---

`;

		if (highlights.length > 0) {
			md += `## Highlights & Quotes\n\n`;
			for (const h of highlights) {
				const cat = getCategoryLabel(h.color);
				md += `> [!quote] Page ${h.page} · #${cat.toLowerCase()}\n`;
				md += `> ${h.text.replace(/\n/g, '\n> ')}\n\n`;

				const linkedNote = notes.find((n) => n.highlightId === h.id || n.id === h.noteId);
				if (linkedNote) {
					md += `> [!note] Insight on Page ${h.page}\n`;
					md += `> ${linkedNote.body.replace(/\n/g, '\n> ')}\n\n`;
				}
			}
		}

		const standAloneNotes = notes.filter(
			(n) => !n.highlightId && !highlights.some((h) => h.noteId === n.id)
		);
		if (standAloneNotes.length > 0) {
			md += `## Notes\n\n`;
			for (const n of standAloneNotes) {
				md += `### Page ${n.page} · ${new Date(n.createdAt).toLocaleDateString()}\n\n`;
				if (n.imageUrl) {
					md += `![Page ${n.page} Diagram](${n.imageUrl})\n\n`;
				}
				if (n.body) {
					md += `${n.body}\n\n`;
				}
			}
		}

		if (bookmarks.length > 0) {
			md += `## Bookmarks\n\n`;
			for (const b of bookmarks) {
				md += `- **Page ${b.page}**: ${b.title || 'Bookmark'}\n`;
			}
			md += '\n';
		}

		downloadFile(md, `${baseName}-obsidian.md`, 'text/markdown');
	}

	function exportAnkiDeck() {
		if (!app.doc) return;
		const baseName = sanitizeFileName(app.doc.name);
		let tsv = `#separator:tab\n#html:true\n#tags column:3\n`;

		for (const c of flashcards) {
			let front = c.front.replace(/\t/g, ' ').replace(/\n/g, '<br>');
			if (c.imageUrl) {
				front = `<img src="${c.imageUrl}"><br>` + front;
			}
			const back = c.back.replace(/\t/g, ' ').replace(/\n/g, '<br>');
			const tag = `Folio ${baseName}`;
			tsv += `"${front}"\t"${back}"\t"${tag}"\n`;
		}

		for (const h of highlights) {
			const linkedNote = notes.find((n) => n.highlightId === h.id || n.id === h.noteId);
			if (linkedNote && !flashcards.some((c) => c.highlightId === h.id)) {
				const front = h.text.replace(/\t/g, ' ').replace(/\n/g, '<br>');
				const back = linkedNote.body.replace(/\t/g, ' ').replace(/\n/g, '<br>');
				const tag = `Folio ${baseName} Page_${h.page}`;
				tsv += `"${front}"\t"${back}"\t"${tag}"\n`;
			}
		}

		downloadFile(tsv, `${baseName}-anki.txt`, 'text/tab-separated-values');
	}

	function exportStandardMarkdown() {
		if (!app.doc) return;
		const baseName = sanitizeFileName(app.doc.name);
		let md = `# ${app.doc.name}\n\n`;
		md += `*Exported from Folio on ${new Date().toLocaleDateString()}*\n`;
		md += `- Total Pages: ${app.totalPages}\n`;
		md += `- Reading Progress: ${app.progress}%\n\n`;

		if (notes.length > 0) {
			md += `## Notes (${notes.length})\n\n`;
			for (const n of notes) {
				md += `### Page ${n.page} · ${new Date(n.createdAt).toLocaleDateString()}\n`;
				if (n.imageUrl) {
					md += `![Page ${n.page} Diagram](${n.imageUrl})\n\n`;
				}
				if (n.body) {
					md += `${n.body}\n\n`;
				}
			}
		}

		if (highlights.length > 0) {
			md += `## Highlights (${highlights.length})\n\n`;
			for (const h of highlights) {
				md += `> "${h.text}"\n`;
				md += `> — *Page ${h.page}*\n\n`;
			}
		}

		if (bookmarks.length > 0) {
			md += `## Bookmarks (${bookmarks.length})\n\n`;
			for (const b of bookmarks) {
				md += `- Page ${b.page}: ${b.title || 'Bookmark'}\n`;
			}
			md += '\n';
		}

		downloadFile(md, `${baseName}-notes.md`, 'text/markdown');
	}

	function exportJsonBackup() {
		if (!app.doc) return;
		const baseName = sanitizeFileName(app.doc.name);
		const data = {
			version: '1.0',
			exportedAt: Date.now(),
			document: {
				id: app.doc.id,
				name: app.doc.name,
				lastPage: app.doc.lastPage,
				totalPages: app.totalPages,
				sessionTime: app.doc.sessionTime
			},
			notes,
			highlights,
			bookmarks,
			flashcards
		};
		downloadFile(JSON.stringify(data, null, 2), `${baseName}-backup.json`, 'application/json');
	}
</script>

<section class="panel">
	<div class="tabs-bar">
		<div class="tabs">
			{#each tabs as t}
				<button class="tab" class:active={app.activeTab === t.id} onclick={() => (app.activeTab = t.id)}>
					{t.label}
					<span class="cnt">{counts[t.id]}</span>
					{#if app.activeTab === t.id}<div class="ind"></div>{/if}
				</button>
			{/each}
		</div>
		<div class="export-wrap">
			<button
				class="export-btn"
				class:active={exportMenuOpen}
				onclick={() => (exportMenuOpen = !exportMenuOpen)}
				title="Export notes and flashcards"
				aria-label="Export options"
			>
				<Icon name="download" />
			</button>
			{#if exportMenuOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="export-menu fade" onclick={(e) => e.stopPropagation()}>
					<div class="export-menu-head">Export Options</div>
					<button class="export-item" onclick={exportObsidianMarkdown}>
						<Icon name="description" class="e-icon" />
						<div class="e-info">
							<span class="e-title">Obsidian Markdown</span>
							<span class="e-desc">Frontmatter, callouts &amp; quotes</span>
						</div>
					</button>
					<button class="export-item" onclick={exportAnkiDeck}>
						<Icon name="style" class="e-icon" />
						<div class="e-info">
							<span class="e-title">Anki Flashcard Deck</span>
							<span class="e-desc">One-click TSV import format</span>
						</div>
					</button>
					<button class="export-item" onclick={exportStandardMarkdown}>
						<Icon name="article" class="e-icon" />
						<div class="e-info">
							<span class="e-title">Standard Markdown</span>
							<span class="e-desc">Plain markdown headings &amp; quotes</span>
						</div>
					</button>
					<button class="export-item" onclick={exportJsonBackup}>
						<Icon name="data_object" class="e-icon" />
						<div class="e-info">
							<span class="e-title">Full JSON Backup</span>
							<span class="e-desc">Everything including SM-2 stats</span>
						</div>
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#key app.activeTab}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="list fade" onclick={onListClick} onkeydown={onListKeyDown} role="list">
		{#if app.activeTab === 'notes'}
			{#if notes.length === 0}
				<div class="empty">
					<Icon name="edit_note" />
					<p>No notes yet. Write one below.</p>
				</div>
			{/if}
			{#each notes as n (n.id)}
				<div class="card" data-page={n.page} role="button" tabindex="0">
					<div class="card-head">
						<span class="badge">Pg. {n.page}</span>
						<div class="head-right">
							<span class="time">{relTime(n.createdAt)}</span>
							<button class="mini" data-action="del-note" data-id={n.id} aria-label="Delete note">
								<Icon name="close" />
							</button>
						</div>
					</div>
					{#if n.imageUrl}
						<div class="note-img-box">
							<img src={n.imageUrl} alt="Clipped snippet" class="note-img" />
						</div>
					{/if}
					{#if n.body}
						<p class="body">{n.body}</p>
					{/if}
				</div>
			{/each}
		{:else if app.activeTab === 'highlights'}
			{#if highlights.length > 0}
				<div class="filter-bar">
					{#each colorCategories as c}
						<button
							class="filter-pill"
							class:active={activeColorFilter === c.id}
							onclick={() => (activeColorFilter = c.id)}
						>
							{#if c.color}<span class="pill-dot" style="background-color: {c.color};"></span>{/if}
							<span>{c.label}</span>
							<span class="pill-cnt">{countsByColor[c.id]}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if filteredHighlights.length === 0}
				<div class="empty">
					<Icon name="ink_highlighter" />
					<p>{highlights.length === 0 ? 'Select text in the document to highlight it.' : 'No highlights in this category.'}</p>
				</div>
			{/if}
			{#each filteredHighlights as h (h.id)}
				<div class="card hl" data-page={h.page} data-hl-id={h.id} role="button" tabindex="0">
					<div class="card-head">
						<div class="badge-group">
							<span class="badge">Pg. {h.page}</span>
							<span class="cat-tag" style="color: {getCategoryColor(h.color)}">
								<span class="cat-dot" style="background-color: {getCategoryColor(h.color)}"></span>
								{getCategoryLabel(h.color)}
							</span>
						</div>
						<div class="head-right">
							<span class="time">{relTime(h.createdAt)}</span>
							<button class="mini" data-action="reply" data-id={h.id} aria-label="Add note to highlight">
								<Icon name="add_comment" />
							</button>
							<button class="mini" data-action="del-hl" data-id={h.id} aria-label="Delete highlight">
								<Icon name="close" />
							</button>
						</div>
					</div>
					<p class="body quote" style="border-left-color: {getCategoryColor(h.color)}">{h.text}</p>
					{#if h.noteId}<span class="linked"><Icon name="link" />Note attached</span>{/if}
				</div>
			{/each}
		{:else if app.activeTab === 'bookmarks'}
			{#if bookmarks.length === 0}
				<div class="empty">
					<Icon name="bookmark_border" />
					<p>No bookmarks yet. Click the bookmark icon in the toolbar to save pages.</p>
				</div>
			{/if}
			{#each bookmarks as b (b.id)}
				<div class="card bm" data-page={b.page} role="button" tabindex="0">
					<div class="card-head">
						<span class="badge">Pg. {b.page}</span>
						<div class="head-right">
							<span class="time">{relTime(b.createdAt)}</span>
							<button class="mini" data-action="del-bm" data-id={b.id} aria-label="Remove bookmark">
								<Icon name="close" />
							</button>
						</div>
					</div>
					<p class="body bm-text">{b.title || `Bookmarked Page ${b.page}`}</p>
				</div>
			{/each}
		{:else if app.activeTab === 'outline'}
			{#if app.outline.length > 5}
				<div class="outline-filter-box">
					<Icon name="search" class="o-filter-icon" />
					<input
						type="search"
						class="outline-filter-input"
						placeholder="Search chapters & sections…"
						bind:value={outlineFilter}
					/>
					{#if outlineFilter}
						<button
							class="o-filter-clear"
							onclick={() => (outlineFilter = '')}
							aria-label="Clear outline search"
						>
							<Icon name="close" />
						</button>
					{/if}
				</div>
			{/if}

			{#if app.outline.length === 0}
				<div class="empty">
					<Icon name="toc" />
					<p>This document has no embedded outline.</p>
				</div>
			{:else if filteredOutline.length === 0}
				<div class="empty">
					<Icon name="search" />
					<p>No outline items match "{outlineFilter}"</p>
				</div>
			{/if}
			{#each filteredOutline as item, i (i)}
				<div
					class="outline-row"
					data-page={item.page}
					role="button"
					tabindex="0"
					style="padding-left:{12 + item.depth * 14}px"
				>
					<span class="o-title">{item.title}</span>
					<span class="o-page">{item.page}</span>
				</div>
			{/each}
		{:else}
			{#if doc && app.totalPages > 0}
				<div class="thumb-grid">
					{#each { length: app.totalPages } as _, i (i + 1)}
						<PdfThumbnail
							{doc}
							pageNumber={i + 1}
							active={app.currentPage === i + 1}
							bookmarked={bookmarks.some((b) => b.page === i + 1)}
							aspect={1.4142}
							onclick={() => ongoto(i + 1)}
						/>
					{/each}
				</div>
			{:else}
				<div class="empty">
					<Icon name="grid_view" />
					<p>Visual thumbnails loading…</p>
				</div>
			{/if}
		{/if}
	</div>
	{/key}

	<div class="bottom">
		<div class="composer" class:reply={replyTo}>
			{#if replyTo}
				<div class="reply-chip">
					<Icon name="format_quote" />
					<span class="reply-text">{replyTo.text}</span>
					<button onclick={() => (replyTo = null)} aria-label="Cancel reply">
						<Icon name="close" />
					</button>
				</div>
			{/if}
			<textarea
				id="composer"
				bind:value={draft}
				placeholder={replyTo ? 'Write the answer for this card…' : 'Add a page note…'}
				onkeydown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
				}}
			></textarea>
			<div class="composer-foot">
				<span class="hint">Pg. {app.currentPage} · ⌘↵</span>
				<button class="primary" onclick={submit} disabled={!draft.trim()}>Save</button>
			</div>
		</div>

		<div class="cards-row">
			<div class="stat">
				<div class="stat-head">
					<span class="label">Progress</span>
					<span class="val">{app.progress}%</span>
				</div>
				<div class="bar"><div class="fill" style="width:{app.progress}%"></div></div>
				<div class="stat-foot">
					<span>Pg {app.currentPage}/{app.totalPages}</span>
					<SessionTimer />
				</div>
			</div>
			<div class="stat recall">
				<div>
					<span class="label">Active Recall</span>
					<div class="recall-num">
						{dueCount}<span class="recall-unit">due</span>
						{#if flashcards.length > dueCount}<span class="recall-total">/ {flashcards.length}</span>{/if}
					</div>
				</div>
				<button class="primary sm" onclick={onreview} disabled={flashcards.length === 0}>
					Review
				</button>
			</div>
		</div>
	</div>
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--card);
		color: var(--card-foreground);
		border-left: 1px solid var(--border);
	}
	.tabs-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px 0;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.tabs {
		display: flex;
		gap: 16px;
		overflow-x: auto;
	}
	.tab {
		position: relative;
		background: none;
		border: none;
		padding: 0 0 10px;
		font: inherit;
		font-size: 13px;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: color 0.15s var(--transition-smooth);
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.tab:hover {
		color: var(--foreground);
	}
	.tab.active {
		color: var(--foreground);
		font-weight: 500;
	}
	.cnt {
		font-size: 10px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		color: var(--muted-foreground);
		background: var(--muted);
		padding: 1px 6px;
		border-radius: var(--radius-sm, 6px);
	}
	.ind {
		position: absolute;
		bottom: -1px;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
		border-radius: 2px;
	}
	.export-wrap {
		position: relative;
	}
	.export-menu {
		position: absolute;
		right: 0;
		top: 36px;
		width: 250px;
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius, 12px);
		box-shadow: var(--shadow-elevated, 0 10px 25px -5px rgba(0, 0, 0, 0.3));
		padding: 6px;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.export-menu-head {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted-foreground);
		padding: 6px 10px 4px;
	}
	.export-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--radius-sm, 8px);
		border: none;
		background: transparent;
		color: var(--foreground);
		cursor: pointer;
		text-align: left;
		transition: background 0.12s ease;
	}
	.export-item:hover {
		background: var(--muted);
	}
	:global(.e-icon) {
		font-size: 18px;
		color: var(--accent);
		flex-shrink: 0;
	}
	.e-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.e-title {
		font-size: 12.5px;
		font-weight: 500;
		line-height: 1.2;
	}
	.e-desc {
		font-size: 10.5px;
		color: var(--muted-foreground);
		line-height: 1.2;
	}

	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 6px;
	}
	.filter-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 20px;
		background: var(--card);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
		font-size: 11.5px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.filter-pill:hover {
		border-color: var(--muted-foreground);
		color: var(--foreground);
	}
	.filter-pill.active {
		background: var(--secondary);
		border-color: var(--accent);
		color: var(--foreground);
		font-weight: 500;
	}
	.pill-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.pill-cnt {
		font-size: 10px;
		opacity: 0.75;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}

	.badge-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cat-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 500;
	}
	.cat-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.export-btn {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 8px;
		cursor: pointer;
		transition: all 0.15s var(--transition-smooth);
	}
	.export-btn:hover {
		color: var(--foreground);
		border-color: var(--accent);
	}
	.export-btn :global(.material-symbols-outlined) {
		font-size: 16px;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		outline: none;
	}
	.fade {
		animation: fadein 0.18s var(--transition-smooth);
	}
	@keyframes fadein {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
	.card {
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius, 10px);
		padding: 12px 14px;
		cursor: pointer;
		transition: border-color 0.15s ease, transform 0.15s ease;
	}
	.card:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}
	.head-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.badge {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--primary);
		background: var(--accent-soft);
		font-weight: 500;
		padding: 2px 7px;
		border-radius: var(--radius-sm, 6px);
	}
	.time {
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.mini {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		padding: 3px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}
	.mini:hover {
		color: var(--destructive);
		background: var(--muted);
	}
	.mini :global(.material-symbols-outlined) {
		font-size: 15px;
	}
	.body {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--foreground);
	}
	.note-img-box {
		margin-bottom: 8px;
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		background: var(--muted);
		display: flex;
		justify-content: center;
		padding: 4px;
	}
	.note-img {
		max-height: 160px;
		max-width: 100%;
		border-radius: 4px;
		object-fit: contain;
	}
	.body.quote {
		border-left: 2.5px solid var(--accent);
		padding-left: 10px;
		color: var(--foreground);
		font-style: italic;
	}
	.linked {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 8px;
		font-size: 10.5px;
		color: var(--muted-foreground);
	}
	.linked :global(.material-symbols-outlined) {
		font-size: 12px;
	}
	.outline-filter-box {
		position: relative;
		display: flex;
		align-items: center;
		margin: 0 4px 10px;
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		padding: 4px 8px;
		gap: 6px;
	}
	:global(.o-filter-icon) {
		font-size: 14px;
		color: var(--muted-foreground);
		flex-shrink: 0;
	}
	.outline-filter-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 12px;
		color: var(--foreground);
		min-width: 0;
	}
	.outline-filter-input::placeholder {
		color: var(--muted-foreground);
	}
	.o-filter-clear {
		background: none;
		border: none;
		padding: 2px;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}
	.o-filter-clear:hover {
		color: var(--foreground);
	}
	.o-filter-clear :global(.material-symbols-outlined) {
		font-size: 13px;
	}
	.outline-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		transition: background 0.12s ease;
	}
	.thumb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: 12px;
		padding: 4px 6px;
	}
	.outline-row:hover {
		background: var(--muted);
	}
	.o-title {
		font-size: 13px;
		color: var(--foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.o-page {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--muted-foreground);
		flex-shrink: 0;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 44px 20px;
		text-align: center;
		color: var(--muted-foreground);
	}
	.empty :global(.material-symbols-outlined) {
		font-size: 32px;
		opacity: 0.5;
	}
	.empty p {
		font-size: 13px;
		margin: 0;
	}
	.bottom {
		flex-shrink: 0;
		padding: 14px;
		padding-bottom: calc(14px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.composer {
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius, 10px);
		padding: 10px;
		transition: border-color 0.15s ease;
	}
	.composer:focus-within {
		border-color: var(--accent);
	}
	.composer.reply {
		border-color: var(--accent);
	}
	.reply-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--muted);
		border-radius: var(--radius-sm, 6px);
		padding: 4px 8px;
		margin-bottom: 8px;
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.reply-chip .reply-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.reply-chip :global(.material-symbols-outlined) {
		font-size: 14px;
	}
	.reply-chip button {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
	}
	textarea {
		width: 100%;
		background: none;
		border: none;
		outline: none;
		resize: none;
		height: 60px;
		font: inherit;
		font-size: 13.5px;
		color: var(--foreground);
		padding: 2px;
	}
	textarea::placeholder {
		color: var(--muted-foreground);
	}
	.composer-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 6px;
	}
	.hint {
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		color: var(--muted-foreground);
	}
	.primary {
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: var(--radius-md, 8px);
		padding: 6px 16px;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	.primary:hover:not(:disabled) {
		transform: translateY(-1px);
		opacity: 0.92;
	}
	.primary:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.primary.sm {
		font-size: 12px;
		padding: 6px 14px;
	}
	.cards-row {
		display: flex;
		gap: 10px;
	}
	.stat {
		flex: 1;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius, 10px);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stat.recall {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}
	.stat-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted-foreground);
		font-weight: 500;
	}
	.val {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		color: var(--foreground);
		font-weight: 500;
	}
	.bar {
		height: 3px;
		background: var(--muted);
		border-radius: 4px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent);
		border-radius: 4px;
		transition: width 0.25s ease;
	}
	.stat-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		color: var(--muted-foreground);
	}
	.recall-num {
		font-size: 22px;
		font-weight: 400;
		color: var(--foreground);
		line-height: 1.1;
		margin-top: 2px;
	}
	.recall-unit {
		font-size: 11px;
		color: var(--muted-foreground);
		margin-left: 4px;
	}
	.recall-total {
		font-size: 11px;
		color: var(--muted-foreground);
		margin-left: 2px;
	}

	@media (pointer: coarse) {
		.mini {
			min-width: 40px;
			min-height: 40px;
			align-items: center;
			justify-content: center;
		}
	}
</style>
