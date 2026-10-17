<script lang="ts">
	import { recentDocsQuery, openFile, app } from '../state.svelte';
	import { db } from '../db';
	import { relTime } from '../time';
	import type { DocumentRecord } from '../types';

	interface Props {
		onopen: () => void;
	}
	let { onopen }: Props = $props();

	const version = '0.1.0';

	let docs = $state<DocumentRecord[]>([]);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const q = recentDocsQuery();
	const sub = q.subscribe((v) => (docs = v));
	$effect(() => () => sub.unsubscribe());

	async function pick(files: FileList | null) {
		const file = files?.[0];
		if (!file || file.type !== 'application/pdf') return;
		await openFile(file, file.name.replace(/\.pdf$/i, ''));
		onopen();
	}

	async function reopen(d: DocumentRecord) {
		await openFile(d.blob, d.name);
		onopen();
	}

	async function remove(e: MouseEvent, d: DocumentRecord) {
		e.stopPropagation();
		await db.transaction('rw', db.documents, db.notes, db.highlights, db.flashcards, async () => {
			await db.documents.delete(d.id);
			await db.notes.where('docId').equals(d.id).delete();
			await db.highlights.where('docId').equals(d.id).delete();
			await db.flashcards.where('docId').equals(d.id).delete();
		});
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
			onclick={() => app.toggleTheme()}
			aria-label="Toggle theme"
			title={app.theme === 'dark' ? 'Switch to warm light theme' : 'Switch to dark theme'}
		>
			<span class="material-symbols-outlined">
				{app.theme === 'dark' ? 'light_mode' : 'dark_mode'}
			</span>
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
			<span class="material-symbols-outlined">menu_book</span>
		</div>
		<h1>Folio</h1>
		<p class="tag">A calm, offline-first reader for papers and books.</p>

		<button class="open-btn" onclick={() => fileInput?.click()}>
			<span class="material-symbols-outlined">upload_file</span>
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
				<span class="material-symbols-outlined">ink_highlighter</span>
				<div>
					<strong>Highlight & annotate</strong>
					<span>Mark passages in multiple colors and attach notes as you read.</span>
				</div>
			</li>
			<li>
				<span class="material-symbols-outlined">bookmark_border</span>
				<div>
					<strong>Smart bookmarking & state</strong>
					<span>Never lose your reading position; jump back exactly where you stopped.</span>
				</div>
			</li>
			<li>
				<span class="material-symbols-outlined">search</span>
				<div>
					<strong>Instant full-text search</strong>
					<span>Find any phrase or equation across all pages within milliseconds.</span>
				</div>
			</li>
			<li>
				<span class="material-symbols-outlined">cycle</span>
				<div>
					<strong>Active recall (SM-2)</strong>
					<span>Turn highlighted citations into spaced-repetition cards automatically.</span>
				</div>
			</li>
		</ul>
	{/if}

	{#if docs.length}
		<div class="recents">
			<h2>Recent Documents</h2>
			<div class="grid">
				{#each docs as d (d.id)}
					<div
						class="doc"
						role="button"
						tabindex="0"
						onclick={() => reopen(d)}
						onkeydown={(e) => e.key === 'Enter' && reopen(d)}
					>
						<div class="doc-thumb">
							<span class="material-symbols-outlined">description</span>
							<button class="del" onclick={(e) => remove(e, d)} aria-label={`Delete ${d.name}`}>
								<span class="material-symbols-outlined">delete</span>
							</button>
						</div>
						<div class="doc-meta">
							<span class="doc-name">{d.name}</span>
							<span class="doc-sub">
								{d.totalPages ? `Page ${d.lastPage}/${d.totalPages} · ` : ''}{relTime(d.lastOpenedAt)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if dragging}
		<div class="drop-overlay">
			<div class="drop-card">
				<span class="material-symbols-outlined">file_download</span>
				Drop PDF to open
			</div>
		</div>
	{/if}

	<footer class="foot">
		<span>100% local</span>
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
	.features li .material-symbols-outlined {
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
	.logo .material-symbols-outlined {
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
	.open-btn .material-symbols-outlined {
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
	.recents h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-foreground);
		margin: 0 0 16px;
		font-weight: 500;
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
	.doc-thumb .material-symbols-outlined {
		font-size: 38px;
		color: var(--muted-foreground);
		opacity: 0.5;
	}
	.del {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm, 6px);
		background: var(--card);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
		display: none;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.doc:hover .del {
		display: flex;
	}
	.del:hover {
		background: var(--destructive);
		color: #ffffff;
		border-color: var(--destructive);
	}
	.del .material-symbols-outlined {
		font-size: 15px;
		opacity: 1;
	}
	.doc-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 2px;
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
	.drop-card .material-symbols-outlined {
		font-size: 40px;
		color: var(--accent);
	}
	@media (hover: none) {
		.del {
			display: flex;
		}
	}
</style>
