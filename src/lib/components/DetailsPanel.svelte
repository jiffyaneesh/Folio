<script lang="ts">
	import { app, addNote, deleteNote, deleteHighlight, deleteBookmark } from '../state.svelte';
	import { relTime } from '../time';
	import SessionTimer from './SessionTimer.svelte';
	import type { NoteRecord, HighlightRecord, FlashcardRecord, BookmarkRecord, Tab } from '../types';

	interface Props {
		notes: NoteRecord[];
		highlights: HighlightRecord[];
		flashcards: FlashcardRecord[];
		bookmarks: BookmarkRecord[];
		dueCount: number;
		onreview: () => void;
		ongoto: (page: number) => void;
	}
	let { notes, highlights, flashcards, bookmarks, dueCount, onreview, ongoto }: Props = $props();

	let draft = $state('');
	let replyTo = $state<HighlightRecord | null>(null);

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'notes', label: 'Notes' },
		{ id: 'highlights', label: 'Highlights' },
		{ id: 'bookmarks', label: 'Bookmarks' },
		{ id: 'outline', label: 'Outline' }
	];

	const counts = $derived<Record<Tab, number>>({
		notes: notes.length,
		highlights: highlights.length,
		bookmarks: bookmarks.length,
		outline: app.outline.length
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
		if (el?.dataset.page) ongoto(Number(el.dataset.page));
	}

	function onListKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			const target = (e.target as HTMLElement).closest('[data-page]') as HTMLElement | null;
			if (target?.dataset.page) {
				e.preventDefault();
				ongoto(Number(target.dataset.page));
			}
		}
	}

	function exportMarkdown() {
		if (!app.doc) return;
		let md = `# ${app.doc.name}\n\n`;
		md += `*Exported from Folio on ${new Date().toLocaleDateString()}*\n`;
		md += `- Total Pages: ${app.totalPages}\n`;
		md += `- Reading Progress: ${app.progress}%\n\n`;

		if (notes.length > 0) {
			md += `## Notes (${notes.length})\n\n`;
			for (const n of notes) {
				md += `### Page ${n.page} · ${new Date(n.createdAt).toLocaleDateString()}\n`;
				md += `${n.body}\n\n`;
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

		const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${app.doc.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-notes.md`;
		a.click();
		URL.revokeObjectURL(url);
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
		<button class="export-btn" onclick={exportMarkdown} title="Export notes and highlights to Markdown" aria-label="Export to Markdown">
			<span class="material-symbols-outlined">download</span>
		</button>
	</div>

	{#key app.activeTab}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="list fade" onclick={onListClick} onkeydown={onListKeyDown} role="list">
		{#if app.activeTab === 'notes'}
			{#if notes.length === 0}
				<div class="empty">
					<span class="material-symbols-outlined">edit_note</span>
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
								<span class="material-symbols-outlined">close</span>
							</button>
						</div>
					</div>
					<p class="body">{n.body}</p>
				</div>
			{/each}
		{:else if app.activeTab === 'highlights'}
			{#if highlights.length === 0}
				<div class="empty">
					<span class="material-symbols-outlined">ink_highlighter</span>
					<p>Select text in the document to highlight it.</p>
				</div>
			{/if}
			{#each highlights as h (h.id)}
				<div class="card hl" data-page={h.page} role="button" tabindex="0">
					<div class="card-head">
						<span class="badge">Pg. {h.page}</span>
						<div class="head-right">
							<span class="time">{relTime(h.createdAt)}</span>
							<button class="mini" data-action="reply" data-id={h.id} aria-label="Add note to highlight">
								<span class="material-symbols-outlined">add_comment</span>
							</button>
							<button class="mini" data-action="del-hl" data-id={h.id} aria-label="Delete highlight">
								<span class="material-symbols-outlined">close</span>
							</button>
						</div>
					</div>
					<p class="body quote">{h.text}</p>
					{#if h.noteId}<span class="linked"><span class="material-symbols-outlined">link</span>Note attached</span>{/if}
				</div>
			{/each}
		{:else if app.activeTab === 'bookmarks'}
			{#if bookmarks.length === 0}
				<div class="empty">
					<span class="material-symbols-outlined">bookmark_border</span>
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
								<span class="material-symbols-outlined">close</span>
							</button>
						</div>
					</div>
					<p class="body bm-text">{b.title || `Bookmarked Page ${b.page}`}</p>
				</div>
			{/each}
		{:else}
			{#if app.outline.length === 0}
				<div class="empty">
					<span class="material-symbols-outlined">toc</span>
					<p>This document has no embedded outline.</p>
				</div>
			{/if}
			{#each app.outline as item, i (i)}
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
		{/if}
	</div>
	{/key}

	<div class="bottom">
		<div class="composer" class:reply={replyTo}>
			{#if replyTo}
				<div class="reply-chip">
					<span class="material-symbols-outlined">format_quote</span>
					<span class="reply-text">{replyTo.text}</span>
					<button onclick={() => (replyTo = null)} aria-label="Cancel reply">
						<span class="material-symbols-outlined">close</span>
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
	.export-btn .material-symbols-outlined {
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
	.mini .material-symbols-outlined {
		font-size: 15px;
	}
	.body {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--foreground);
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
	.linked .material-symbols-outlined {
		font-size: 12px;
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
	.empty .material-symbols-outlined {
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
	.reply-chip .material-symbols-outlined {
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
