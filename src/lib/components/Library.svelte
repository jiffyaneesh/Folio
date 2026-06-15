<script lang="ts">
	import { recentDocsQuery, openFile } from '../state.svelte';
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
	aria-label="Open a document"
>
	<div class="orbs" aria-hidden="true">
		<span class="orb orb-a"></span>
		<span class="orb orb-b"></span>
		<span class="orb orb-c"></span>
	</div>
	<a
		class="gh-link"
		href="https://github.com/aneeshsharma72067"
		target="_blank"
		rel="noopener noreferrer"
		aria-label="GitHub profile"
		title="GitHub profile"
	>
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
			<path
				fill="currentColor"
				d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"
			/>
		</svg>
	</a>
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
					<span>Mark passages and attach notes as you read.</span>
				</div>
			</li>
			<li>
				<span class="material-symbols-outlined">search</span>
				<div>
					<strong>Full-text search</strong>
					<span>Find any line across every document instantly.</span>
				</div>
			</li>
			<li>
				<span class="material-symbols-outlined">cycle</span>
				<div>
					<strong>Spaced repetition</strong>
					<span>Turn highlights into flashcards that resurface on time.</span>
				</div>
			</li>
		</ul>
	{/if}

	{#if docs.length}
		<div class="recents">
			<h2>Recent</h2>
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
							<button class="del" onclick={(e) => remove(e, d)} aria-label="Remove">
								<span class="material-symbols-outlined">delete</span>
							</button>
						</div>
						<div class="doc-meta">
							<span class="doc-name">{d.name}</span>
							<span class="doc-sub">
								{d.totalPages ? `${d.lastPage}/${d.totalPages} · ` : ''}{relTime(d.lastOpenedAt)}
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
				Drop to open
			</div>
		</div>
	{/if}

	<footer class="foot">
		<span>100% local</span>
		<span class="dot">·</span>
		<span>no account</span>
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
		padding: calc(8vh + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right))
			calc(60px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
		background: radial-gradient(120% 90% at 50% -10%, #18181b 0%, #0c0c0d 55%, #08080a 100%);
		position: relative;
	}
	.gh-link {
		position: absolute;
		top: calc(16px + env(safe-area-inset-top));
		right: calc(16px + env(safe-area-inset-right));
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
		z-index: 10;
	}
	.gh-link:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-2px);
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

	/* Ambient drifting glow behind the hero — atmosphere only, no layout impact. */
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
		filter: blur(70px);
		opacity: 0.4;
		will-change: transform;
	}
	.orb-a {
		top: 6%;
		left: 18%;
		width: 320px;
		height: 320px;
		background: radial-gradient(circle, #2d4f8a 0%, transparent 70%);
		animation: drift-a 22s ease-in-out infinite;
	}
	.orb-b {
		top: 18%;
		right: 12%;
		width: 280px;
		height: 280px;
		background: radial-gradient(circle, #6a3d8a 0%, transparent 70%);
		animation: drift-b 28s ease-in-out infinite;
	}
	.orb-c {
		bottom: 8%;
		left: 40%;
		width: 360px;
		height: 360px;
		background: radial-gradient(circle, #1f6e6a 0%, transparent 70%);
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
		margin: 48px 0 0;
		padding: 0;
		width: 100%;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		gap: 18px;
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
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
		margin-top: 1px;
	}
	.features li div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.features strong {
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.82);
	}
	.features li div span {
		font-size: 12.5px;
		color: rgba(255, 255, 255, 0.4);
		line-height: 1.4;
	}

	.foot {
		margin-top: auto;
		padding-top: 48px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.3);
		position: relative;
		z-index: 1;
	}
	.foot a {
		color: rgba(255, 255, 255, 0.45);
		text-decoration: none;
	}
	.foot a:hover {
		color: rgba(255, 255, 255, 0.75);
	}
	.foot .dot {
		opacity: 0.5;
	}
	.logo {
		width: 64px;
		height: 64px;
		border-radius: 18px;
		background: linear-gradient(160deg, #232327, #161618);
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 20px;
		box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.7);
	}
	.logo .material-symbols-outlined {
		font-size: 32px;
		color: rgba(255, 255, 255, 0.85);
	}
	h1 {
		font-size: 34px;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
		color: #fff;
	}
	.tag {
		font-size: 15px;
		color: rgba(255, 255, 255, 0.45);
		margin: 8px 0 28px;
	}
	.open-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #fff;
		color: #000;
		border: none;
		border-radius: 12px;
		padding: 12px 24px;
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 8px 24px -8px rgba(255, 255, 255, 0.3);
	}
	.open-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 32px -8px rgba(255, 255, 255, 0.4);
	}
	.open-btn .material-symbols-outlined {
		font-size: 20px;
	}
	.drop-hint {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.3);
		margin-top: 14px;
	}
	.recents {
		width: 100%;
		max-width: 820px;
		margin-top: 56px;
	}
	.recents h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.35);
		margin: 0 0 16px;
		font-weight: 500;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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
		border-radius: 10px;
		background: linear-gradient(160deg, #1c1c1f, #141416);
		border: 1px solid rgba(255, 255, 255, 0.07);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease, border-color 0.15s ease;
	}
	.doc:hover .doc-thumb {
		transform: translateY(-3px);
		border-color: rgba(255, 255, 255, 0.16);
	}
	.doc-thumb .material-symbols-outlined {
		font-size: 36px;
		color: rgba(255, 255, 255, 0.25);
	}
	.del {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		color: rgba(255, 255, 255, 0.6);
		display: none;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.doc:hover .del {
		display: flex;
	}
	.del:hover {
		background: rgba(220, 60, 60, 0.8);
		color: #fff;
	}
	.del .material-symbols-outlined {
		font-size: 15px;
	}
	.doc-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 2px;
	}
	.doc-name {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.8);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.doc-sub {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.35);
	}
	.drop-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
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
		padding: 40px 64px;
		border: 2px dashed rgba(255, 255, 255, 0.3);
		border-radius: 20px;
		font-size: 16px;
		color: rgba(255, 255, 255, 0.85);
	}
	.drop-card .material-symbols-outlined {
		font-size: 40px;
	}

	/* Touch: no hover to reveal the remove button — show it always. */
	@media (hover: none) {
		.del {
			display: flex;
		}
	}

	@media (max-width: 560px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
			gap: 12px;
		}
		.recents {
			margin-top: 40px;
		}
	}
	@media (max-width: 420px) {
		h1 {
			font-size: 28px;
		}
		.tag {
			font-size: 14px;
		}
	}
	@media (max-height: 560px) {
		.library {
			padding-top: calc(4vh + env(safe-area-inset-top));
		}
	}
</style>
