<script lang="ts">
	import { recentDocsQuery, openFile, openDocument, app } from '../state.svelte';
	import { db } from '../db';
	import { relTime } from '../time';
	import Icon from './Icon.svelte';
	import StatsModal from './StatsModal.svelte';
	import BackupModal from './BackupModal.svelte';
	import type { DocumentRecord } from '../types';

	interface Props {
		onopen: () => void;
	}
	let { onopen }: Props = $props();

	const version = '0.1.0';

	let docs = $state<DocumentRecord[]>([]);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let searchQuery = $state('');
	let sortBy = $state<'recent' | 'name' | 'progress' | 'pages'>('recent');
	let storageUsage = $state<string | null>(null);
	let statsOpen = $state(false);
	let backupOpen = $state(false);

	const q = recentDocsQuery();
	const sub = q.subscribe((v) => (docs = v));
	$effect(() => () => sub.unsubscribe());

	$effect(() => {
		if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
			navigator.storage
				.estimate()
				.then((est) => {
					if (est.usage) {
						const mb = (est.usage / (1024 * 1024)).toFixed(1);
						storageUsage = `${mb} MB`;
					}
				})
				.catch(() => {});
		}
	});

	const filteredDocs = $derived.by(() => {
		let list = docs;
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			list = list.filter((d) => d.name.toLowerCase().includes(query));
		}
		return [...list].sort((a, b) => {
			if (sortBy === 'name') return a.name.localeCompare(b.name);
			if (sortBy === 'progress') {
				const progA = a.totalPages ? a.lastPage / a.totalPages : 0;
				const progB = b.totalPages ? b.lastPage / b.totalPages : 0;
				return progB - progA;
			}
			if (sortBy === 'pages') {
				return (b.totalPages || 0) - (a.totalPages || 0);
			}
			return b.lastOpenedAt - a.lastOpenedAt;
		});
	});

	async function pick(files: FileList | null) {
		const file = files?.[0];
		if (!file || file.type !== 'application/pdf') return;
		await openFile(file, file.name.replace(/\.pdf$/i, ''));
		onopen();
	}

	async function reopen(d: DocumentRecord) {
		await openDocument(d);
		onopen();
	}

	async function downloadDocPdf(e: MouseEvent, d: DocumentRecord) {
		e.stopPropagation();
		const fileRec = await db.files.get(d.id);
		const blob = fileRec?.blob || d.blob;
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${d.name}.pdf`;
		a.click();
		URL.revokeObjectURL(url);
	}

	let editingId = $state<string | null>(null);
	let editName = $state('');

	function startRename(e: MouseEvent, d: DocumentRecord) {
		e.stopPropagation();
		editingId = d.id;
		editName = d.name;
	}

	async function commitRename(d: DocumentRecord) {
		if (editingId !== d.id) return;
		const cleanName = editName.replace(/[\x00-\x1f\x7f]/g, '').trim();
		if (cleanName && cleanName !== d.name) {
			await db.documents.update(d.id, { name: cleanName.slice(0, 150) });
		}
		editingId = null;
		editName = '';
	}

	function cancelRename() {
		editingId = null;
		editName = '';
	}

	async function remove(e: MouseEvent, d: DocumentRecord) {
		e.stopPropagation();
		await db.transaction(
			'rw',
			[db.documents, db.files, db.notes, db.highlights, db.flashcards, db.bookmarks],
			async () => {
				await db.documents.delete(d.id);
				await db.files.delete(d.id);
				await db.notes.where('docId').equals(d.id).delete();
				await db.highlights.where('docId').equals(d.id).delete();
				await db.flashcards.where('docId').equals(d.id).delete();
				await db.bookmarks.where('docId').equals(d.id).delete();
			}
		);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		pick(e.dataTransfer?.files ?? null);
	}
</script>

<div
	class="library"
	class:dragging
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
	role="region"
	aria-label="Document Library"
>
	<div class="orbs" aria-hidden="true">
		<span class="orb orb-a"></span>
		<span class="orb orb-b"></span>
		<span class="orb orb-c"></span>
	</div>

	<div class="top-nav">
		<button
			class="nav-btn"
			onclick={() => (statsOpen = true)}
			aria-label="Study &amp; Reading Insights"
			title="Study &amp; Reading Analytics"
		>
			<Icon name="bar_chart" />
		</button>
		<button
			class="nav-btn"
			onclick={() => (backupOpen = true)}
			aria-label="Library Backup &amp; Restore"
			title="Backup &amp; Restore Library"
		>
			<Icon name="backup" />
		</button>
		<button
			class="nav-btn"
			onclick={() => app.toggleTheme()}
			aria-label="Toggle theme"
			title={app.theme === 'dark' ? 'Switch to warm light theme' : 'Switch to dark theme'}
		>
			<Icon name={app.theme === 'dark' ? 'light_mode' : 'dark_mode'} />
		</button>
		<a
			class="nav-btn"
			href="https://github.com/aneeshsharma72067"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="GitHub profile"
			title="GitHub profile"
		>
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<path
					fill="currentColor"
					d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"
				/>
			</svg>
		</a>
	</div>

	<div class="hero">
		<div class="logo">
			<Icon name="menu_book" />
		</div>
		<h1>Folio</h1>
		<p class="tag">A calm, offline-first reader for papers and books.</p>

		<button class="open-btn" onclick={() => fileInput?.click()}>
			<Icon name="upload_file" />
			Open PDF
		</button>
		<p class="drop-hint">or drop a file anywhere · stays on your device</p>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/pdf"
			hidden
			onchange={(e) => pick((e.target as HTMLInputElement).files)}
		/>
	</div>

	{#if !docs.length}
		<ul class="features">
			<li>
				<Icon name="ink_highlighter" />
				<div>
					<strong>Highlight & annotate</strong>
					<span>Mark passages in multiple colors and attach notes as you read.</span>
				</div>
			</li>
			<li>
				<Icon name="bookmark_border" />
				<div>
					<strong>Smart bookmarking & state</strong>
					<span>Never lose your reading position; jump back exactly where you stopped.</span>
				</div>
			</li>
			<li>
				<Icon name="search" />
				<div>
					<strong>Instant full-text search</strong>
					<span>Find any phrase or equation across all pages within milliseconds.</span>
				</div>
			</li>
			<li>
				<Icon name="cycle" />
				<div>
					<strong>Active recall (SM-2)</strong>
					<span>Turn highlighted citations into spaced-repetition cards automatically.</span>
				</div>
			</li>
		</ul>
	{/if}

	{#if docs.length}
		<div class="recents">
			<div class="recents-header">
				<div class="recents-title-row">
					<h2>Recent Documents</h2>
					<span class="doc-count-badge">{docs.length}</span>
				</div>

				<div class="recents-tools">
					<div class="lib-search">
						<Icon name="search" class="lib-search-icon" />
						<input
							type="search"
							placeholder="Search library…"
							bind:value={searchQuery}
							class="lib-search-input"
						/>
						{#if searchQuery}
							<button
								class="lib-search-clear"
								onclick={() => (searchQuery = '')}
								aria-label="Clear search"
							>
								<Icon name="close" />
							</button>
						{/if}
					</div>

					<div class="sort-wrap">
						<select bind:value={sortBy} class="sort-select" aria-label="Sort documents">
							<option value="recent">Recent</option>
							<option value="name">Name (A–Z)</option>
							<option value="progress">Progress</option>
							<option value="pages">Length</option>
						</select>
					</div>
				</div>
			</div>

			{#if filteredDocs.length === 0}
				<div class="empty-search">
					<Icon name="search" />
					<p>No documents match "{searchQuery}"</p>
					<button class="clear-btn" onclick={() => (searchQuery = '')}>Clear filter</button>
				</div>
			{:else}
				<div class="grid">
					{#each filteredDocs as d (d.id)}
						<div
							class="doc"
							role="button"
							tabindex="0"
							onclick={() => reopen(d)}
							onkeydown={(e) => e.key === 'Enter' && reopen(d)}
						>
							<div class="doc-thumb">
								<Icon name="description" />
								{#if d.totalPages && d.lastPage}
									<div class="card-prog-bar">
										<div
											class="card-prog-fill"
											style="width:{Math.min(100, Math.round((d.lastPage / d.totalPages) * 100))}%"
										></div>
									</div>
								{/if}
								<div class="card-actions">
									<button
										class="card-act-btn dl-btn"
										onclick={(e) => downloadDocPdf(e, d)}
										aria-label={`Download PDF ${d.name}`}
										title="Download PDF file"
									>
										<Icon name="file_download" />
									</button>
									<button
										class="card-act-btn edit-btn"
										onclick={(e) => startRename(e, d)}
										aria-label={`Rename ${d.name}`}
										title="Rename document"
									>
										<Icon name="edit" />
									</button>
									<button
										class="card-act-btn del-btn"
										onclick={(e) => remove(e, d)}
										aria-label={`Delete ${d.name}`}
										title="Delete document"
									>
										<Icon name="delete" />
									</button>
								</div>
							</div>
							<div class="doc-meta">
								{#if editingId === d.id}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<div
										class="rename-wrap"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
										role="group"
										aria-label="Rename document"
									>
										<!-- svelte-ignore a11y_autofocus -->
										<input
											type="text"
											class="rename-input"
											bind:value={editName}
											autofocus
											maxlength="150"
											onkeydown={(e) => {
												if (e.key === 'Enter') commitRename(d);
												else if (e.key === 'Escape') cancelRename();
											}}
										/>
										<button
											class="rename-save"
											onclick={() => commitRename(d)}
											aria-label="Save name"
											title="Save (Enter)"
										>
											<Icon name="check" />
										</button>
										<button
											class="rename-cancel"
											onclick={cancelRename}
											aria-label="Cancel rename"
											title="Cancel (Esc)"
										>
											<Icon name="close" />
										</button>
									</div>
								{:else}
									<span class="doc-name" title={d.name}>{d.name}</span>
									<div class="doc-sub-row">
										<span class="doc-sub">
											{d.totalPages ? `Pg ${d.lastPage}/${d.totalPages}` : ''}
										</span>
										{#if d.totalPages}
											<span class="doc-dot">·</span>
										{/if}
										<span class="doc-sub">{relTime(d.lastOpenedAt)}</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if dragging}
		<div class="drop-overlay">
			<div class="drop-card">
				<Icon name="file_download" />
				Drop PDF to open
			</div>
		</div>
	{/if}

	<footer class="foot">
		<span>100% local{#if storageUsage} ({storageUsage}){/if}</span>
		<span class="dot">·</span>
		<span>no tracking</span>
		<span class="dot">·</span>
		<a href="https://github.com/aneeshsharma72067/Folio" target="_blank" rel="noopener noreferrer">
			open source
		</a>
		<span class="dot">·</span>
		<span>v{version}</span>
	</footer>
</div>

<StatsModal open={statsOpen} onclose={() => (statsOpen = false)} />
<BackupModal open={backupOpen} onclose={() => (backupOpen = false)} />

<style>
	.library {
		height: 100%;
		width: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: calc(6vh + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right))
			calc(48px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
		background: var(--app-bg);
		color: var(--foreground);
		position: relative;
		transition: background-color 0.2s var(--transition-smooth);
	}
	.top-nav {
		position: absolute;
		top: calc(16px + env(safe-area-inset-top));
		right: calc(16px + env(safe-area-inset-right));
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 10;
	}
	.nav-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md, 8px);
		color: var(--muted-foreground);
		background: var(--card);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-subtle);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.nav-btn:hover {
		color: var(--foreground);
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 480px;
		position: relative;
		z-index: 1;
	}
	.orbs {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
	}
	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.28;
		will-change: transform;
	}
	.orb-a {
		top: 6%;
		left: 18%;
		width: 340px;
		height: 340px;
		background: radial-gradient(circle, #2d5ca8 0%, transparent 70%);
		animation: drift-a 22s ease-in-out infinite;
	}
	.orb-b {
		top: 20%;
		right: 12%;
		width: 300px;
		height: 300px;
		background: radial-gradient(circle, #7e3fa8 0%, transparent 70%);
		animation: drift-b 28s ease-in-out infinite;
	}
	.orb-c {
		bottom: 8%;
		left: 40%;
		width: 360px;
		height: 360px;
		background: radial-gradient(circle, #1f7b76 0%, transparent 70%);
		animation: drift-c 32s ease-in-out infinite;
	}
	@keyframes drift-a {
		50% {
			transform: translate(60px, 40px) scale(1.1);
		}
	}
	@keyframes drift-b {
		50% {
			transform: translate(-50px, 60px) scale(1.15);
		}
	}
	@keyframes drift-c {
		50% {
			transform: translate(40px, -50px) scale(1.05);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orb {
			animation: none;
		}
	}
	.features {
		list-style: none;
		margin: 40px 0 0;
		padding: 20px 24px;
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl, 16px);
		box-shadow: var(--shadow-soft);
		position: relative;
		z-index: 1;
	}
	.features li {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		text-align: left;
	}
	.features li :global(.material-symbols-outlined) {
		font-size: 22px;
		color: var(--accent);
		flex-shrink: 0;
		margin-top: 1px;
	}
	.features li div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.features strong {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--foreground);
	}
	.features li div span {
		font-size: 12px;
		color: var(--muted-foreground);
		line-height: 1.4;
	}
	.foot {
		margin-top: auto;
		padding-top: 48px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--muted-foreground);
		position: relative;
		z-index: 1;
	}
	.foot a {
		color: var(--foreground);
		text-decoration: none;
	}
	.foot a:hover {
		color: var(--accent);
	}
	.foot .dot {
		opacity: 0.5;
	}
	.logo {
		width: 60px;
		height: 60px;
		border-radius: var(--radius-xl, 16px);
		background: var(--card);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-soft);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 18px;
	}
	.logo :global(.material-symbols-outlined) {
		font-size: 30px;
		color: var(--primary);
	}
	h1 {
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.025em;
		margin: 0;
		color: var(--foreground);
	}
	.tag {
		font-size: 14.5px;
		color: var(--muted-foreground);
		margin: 8px 0 24px;
	}
	.open-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: var(--radius-md, 10px);
		padding: 11px 24px;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
		box-shadow: var(--shadow-soft);
	}
	.open-btn:hover {
		transform: translateY(-1.5px);
		box-shadow: var(--shadow-elevated);
		opacity: 0.95;
	}
	.open-btn :global(.material-symbols-outlined) {
		font-size: 20px;
	}
	.drop-hint {
		font-size: 12px;
		color: var(--muted-foreground);
		margin-top: 12px;
	}
	.recents {
		width: 100%;
		max-width: 840px;
		margin-top: 48px;
		z-index: 1;
	}
	.recents-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}
	.recents-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.recents h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-foreground);
		margin: 0;
		font-weight: 600;
	}
	.doc-count-badge {
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid var(--border);
	}
	.recents-tools {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.lib-search {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		padding: 4px 8px;
		box-shadow: var(--shadow-subtle);
		width: 180px;
		transition: border-color 0.15s ease, width 0.15s ease;
	}
	.lib-search:focus-within {
		border-color: var(--accent);
		width: 220px;
	}
	:global(.lib-search-icon) {
		font-size: 14px;
		color: var(--muted-foreground);
		flex-shrink: 0;
	}
	.lib-search-input {
		background: transparent;
		border: none;
		outline: none;
		font-size: 12px;
		color: var(--foreground);
		width: 100%;
		min-width: 0;
	}
	.lib-search-input::placeholder {
		color: var(--muted-foreground);
	}
	.lib-search-clear {
		background: none;
		border: none;
		padding: 0;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lib-search-clear:hover {
		color: var(--foreground);
	}
	.lib-search-clear :global(.material-symbols-outlined) {
		font-size: 13px;
	}
	.sort-wrap {
		position: relative;
	}
	.sort-select {
		background: var(--card);
		color: var(--muted-foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		padding: 4px 8px;
		font-size: 11.5px;
		font-family: inherit;
		cursor: pointer;
		outline: none;
		box-shadow: var(--shadow-subtle);
		transition: border-color 0.15s ease, color 0.15s ease;
	}
	.sort-select:hover,
	.sort-select:focus {
		border-color: var(--accent);
		color: var(--foreground);
	}
	.empty-search {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 48px 0;
		color: var(--muted-foreground);
		text-align: center;
	}
	.empty-search :global(.material-symbols-outlined) {
		font-size: 32px;
		opacity: 0.5;
	}
	.empty-search p {
		margin: 0;
		font-size: 13.5px;
	}
	.clear-btn {
		background: var(--muted);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		padding: 5px 12px;
		font-size: 12px;
		cursor: pointer;
		margin-top: 4px;
		transition: background 0.12s ease;
	}
	.clear-btn:hover {
		background: var(--accent);
		color: var(--accent-foreground, #000);
	}
	.card-prog-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(0, 0, 0, 0.08);
		border-bottom-left-radius: var(--radius, 10px);
		border-bottom-right-radius: var(--radius, 10px);
		overflow: hidden;
	}
	.card-prog-fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s ease;
	}
	.doc-sub-row {
		display: flex;
		align-items: baseline;
		gap: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.doc-dot {
		font-size: 10px;
		color: var(--muted-foreground);
		opacity: 0.6;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(154px, 1fr));
		gap: 16px;
	}
	.doc {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.doc-thumb {
		position: relative;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius, 10px);
		background: var(--card);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-subtle);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.doc:hover .doc-thumb {
		transform: translateY(-2px);
		border-color: var(--accent);
		box-shadow: var(--shadow-soft);
	}
	.doc-thumb :global(.material-symbols-outlined) {
		font-size: 38px;
		color: var(--muted-foreground);
		opacity: 0.5;
	}
	.card-actions {
		position: absolute;
		top: 6px;
		right: 6px;
		display: none;
		align-items: center;
		gap: 4px;
		z-index: 2;
	}
	.doc:hover .card-actions {
		display: flex;
	}
	.card-act-btn {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm, 6px);
		background: var(--card);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	.card-act-btn:hover {
		color: var(--foreground);
		border-color: var(--accent);
		transform: scale(1.05);
	}
	.card-act-btn.del-btn:hover {
		background: var(--destructive);
		color: #ffffff;
		border-color: var(--destructive);
	}
	.card-act-btn :global(.material-symbols-outlined) {
		font-size: 14px;
		opacity: 1;
	}
	.doc-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 2px;
		min-height: 38px;
	}
	.rename-wrap {
		display: flex;
		align-items: center;
		gap: 3px;
		width: 100%;
		margin-top: 1px;
	}
	.rename-input {
		flex: 1;
		min-width: 0;
		background: var(--card);
		border: 1.5px solid var(--accent);
		color: var(--foreground);
		border-radius: var(--radius-sm, 5px);
		padding: 3px 6px;
		font-size: 12px;
		font-family: inherit;
		outline: none;
	}
	.rename-save,
	.rename-cancel {
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 5px);
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px;
		transition: all 0.12s ease;
		flex-shrink: 0;
	}
	.rename-save:hover {
		background: var(--accent);
		color: var(--accent-foreground, #000);
	}
	.rename-cancel:hover {
		background: var(--destructive);
		color: #ffffff;
	}
	.rename-save :global(.material-symbols-outlined),
	.rename-cancel :global(.material-symbols-outlined) {
		font-size: 13px;
	}
	.doc-name {
		font-size: 13px;
		color: var(--foreground);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.doc-sub {
		font-size: 11px;
		color: var(--muted-foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.drop-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		pointer-events: none;
	}
	.drop-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 36px 60px;
		border: 2px dashed var(--accent);
		border-radius: var(--radius-xl, 18px);
		font-size: 16px;
		background: var(--card);
		color: var(--foreground);
		box-shadow: var(--shadow-elevated);
	}
	.drop-card :global(.material-symbols-outlined) {
		font-size: 40px;
		color: var(--accent);
	}
	@media (hover: none) {
		.card-actions {
			display: flex;
		}
	}
</style>
