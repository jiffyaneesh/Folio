<script lang="ts">
	import Icon from './Icon.svelte';
	import { db } from '../db';
	import type { DocumentRecord, HighlightRecord, NoteRecord, FlashcardRecord, BookmarkRecord } from '../types';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	let restoring = $state(false);
	let statusMessage = $state<string | null>(null);
	let isError = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	interface BackupPayload {
		app: 'folio';
		version: 1;
		exportedAt: number;
		counts: {
			documents: number;
			highlights: number;
			notes: number;
			flashcards: number;
			bookmarks: number;
		};
		data: {
			documents: DocumentRecord[];
			highlights: HighlightRecord[];
			notes: NoteRecord[];
			flashcards: FlashcardRecord[];
			bookmarks: BookmarkRecord[];
		};
	}

	let pendingBackup = $state<BackupPayload | null>(null);

	async function exportLibrary() {
		try {
			statusMessage = 'Exporting library data…';
			isError = false;

			const [docs, hls, notes, fcs, bms] = await Promise.all([
				db.documents.toArray(),
				db.highlights.toArray(),
				db.notes.toArray(),
				db.flashcards.toArray(),
				db.bookmarks.toArray()
			]);

			const payload: BackupPayload = {
				app: 'folio',
				version: 1,
				exportedAt: Date.now(),
				counts: {
					documents: docs.length,
					highlights: hls.length,
					notes: notes.length,
					flashcards: fcs.length,
					bookmarks: bms.length
				},
				data: {
					documents: docs.map((d) => {
						const copy = { ...d };
						delete copy.blob; // ensure no legacy blob leak
						return copy;
					}),
					highlights: hls,
					notes: notes,
					flashcards: fcs,
					bookmarks: bms
				}
			};

			const jsonStr = JSON.stringify(payload, null, 2);
			const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const dateStr = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `folio-library-backup-${dateStr}.json`;
			a.click();
			URL.revokeObjectURL(url);

			statusMessage = `Exported ${docs.length} documents and ${hls.length + notes.length} annotations successfully!`;
		} catch (err) {
			console.error('Backup export failed', err);
			isError = true;
			statusMessage = 'Failed to export backup. Please try again.';
		}
	}

	function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const text = reader.result as string;
				const parsed = JSON.parse(text);

				if (!parsed.data || !Array.isArray(parsed.data.documents)) {
					throw new Error('Invalid backup schema: missing documents array');
				}

				pendingBackup = {
					app: 'folio',
					version: 1,
					exportedAt: parsed.exportedAt || Date.now(),
					counts: {
						documents: parsed.data.documents?.length || 0,
						highlights: parsed.data.highlights?.length || 0,
						notes: parsed.data.notes?.length || 0,
						flashcards: parsed.data.flashcards?.length || 0,
						bookmarks: parsed.data.bookmarks?.length || 0
					},
					data: {
						documents: parsed.data.documents || [],
						highlights: parsed.data.highlights || [],
						notes: parsed.data.notes || [],
						flashcards: parsed.data.flashcards || [],
						bookmarks: parsed.data.bookmarks || []
					}
				};
				statusMessage = null;
				isError = false;
			} catch (err) {
				console.error('Failed to parse backup JSON', err);
				isError = true;
				statusMessage = 'Invalid Folio backup JSON file.';
				pendingBackup = null;
			}
		};
		reader.readAsText(file);
	}

	async function applyRestore(mode: 'merge' | 'replace') {
		if (!pendingBackup) return;
		restoring = true;
		isError = false;
		statusMessage = 'Restoring library…';

		try {
			const b = pendingBackup;
			await db.transaction(
				'rw',
				[db.documents, db.highlights, db.notes, db.flashcards, db.bookmarks],
				async () => {
					if (mode === 'replace') {
						await db.documents.clear();
						await db.highlights.clear();
						await db.notes.clear();
						await db.flashcards.clear();
						await db.bookmarks.clear();
					}

					if (b.data.documents.length) await db.documents.bulkPut(b.data.documents);
					if (b.data.highlights.length) await db.highlights.bulkPut(b.data.highlights);
					if (b.data.notes.length) await db.notes.bulkPut(b.data.notes);
					if (b.data.flashcards.length) await db.flashcards.bulkPut(b.data.flashcards);
					if (b.data.bookmarks.length) await db.bookmarks.bulkPut(b.data.bookmarks);
				}
			);

			statusMessage = `Successfully restored ${b.counts.documents} documents and ${b.counts.highlights + b.counts.notes} annotations!`;
			pendingBackup = null;
			if (fileInput) fileInput.value = '';
		} catch (err) {
			console.error('Failed to restore backup', err);
			isError = true;
			statusMessage = 'Error during restore. Check console for details.';
		} finally {
			restoring = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="bk-backdrop" onclick={onclose} role="presentation">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<div
			class="bk-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="bk-title"
			tabindex="-1"
		>
			<div class="bk-head">
				<div class="bk-title-row">
					<Icon name="backup" />
					<h2 id="bk-title">Library Backup &amp; Restore</h2>
				</div>
				<button class="bk-close" onclick={onclose} aria-label="Close dialog">
					<Icon name="close" />
				</button>
			</div>

			<div class="bk-body">
				<p class="bk-desc">
					Folio stores your notes, citations, bookmarks, and spaced repetition cards 100% offline in your browser's IndexedDB. Export a backup to safeguard your study history or transfer to another device.
				</p>

				<div class="bk-cards">
					<!-- Export Section -->
					<div class="bk-card">
						<div class="bk-card-icon">
							<Icon name="file_download" />
						</div>
						<div class="bk-card-info">
							<h3>Export Library</h3>
							<p>Download complete JSON backup containing all document metadata, annotations, flashcards, and reading progress.</p>
							<button class="action-btn primary" onclick={exportLibrary}>
								<Icon name="file_download" />
								<span>Download Backup (.json)</span>
							</button>
						</div>
					</div>

					<!-- Restore Section -->
					<div class="bk-card">
						<div class="bk-card-icon">
							<Icon name="restore" />
						</div>
						<div class="bk-card-info">
							<h3>Restore Library</h3>
							<p>Import a previously saved Folio backup JSON file to restore your library documents and notes.</p>
							<input
								bind:this={fileInput}
								type="file"
								accept=".json,application/json"
								hidden
								onchange={handleFileSelected}
							/>
							<button class="action-btn secondary" onclick={() => fileInput?.click()}>
								<Icon name="upload_file" />
								<span>Select Backup File</span>
							</button>
						</div>
					</div>
				</div>

				{#if pendingBackup}
					<div class="restore-preview">
						<h4>Backup Ready to Restore:</h4>
						<ul class="preview-stats">
							<li><strong>{pendingBackup.counts.documents}</strong> Documents</li>
							<li><strong>{pendingBackup.counts.highlights}</strong> Highlights</li>
							<li><strong>{pendingBackup.counts.notes}</strong> Notes</li>
							<li><strong>{pendingBackup.counts.flashcards}</strong> Flashcards</li>
							<li><strong>{pendingBackup.counts.bookmarks}</strong> Bookmarks</li>
						</ul>

						<div class="restore-actions">
							<button
								class="action-btn primary"
								disabled={restoring}
								onclick={() => applyRestore('merge')}
							>
								{restoring ? 'Restoring…' : 'Merge into Library'}
							</button>
							<button
								class="action-btn danger"
								disabled={restoring}
								onclick={() => {
									if (confirm('Replace entire library with this backup? This overwrites current records.')) {
										applyRestore('replace');
									}
								}}
							>
								Replace All
							</button>
							<button
								class="action-btn ghost"
								disabled={restoring}
								onclick={() => {
									pendingBackup = null;
									if (fileInput) fileInput.value = '';
								}}
							>
								Cancel
							</button>
						</div>
					</div>
				{/if}

				{#if statusMessage}
					<div class="status-msg" class:error={isError}>
						<Icon name={isError ? 'close' : 'check'} />
						<span>{statusMessage}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.bk-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		animation: bkFade 0.15s ease-out;
	}
	@keyframes bkFade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.bk-modal {
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 14px);
		width: 100%;
		max-width: 580px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	.bk-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 22px;
		border-bottom: 1px solid var(--border);
	}
	.bk-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--foreground);
	}
	.bk-title-row h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.bk-title-row :global(.material-symbols-outlined) {
		color: var(--accent);
		font-size: 22px;
	}
	.bk-close {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 6px;
		border-radius: var(--radius-sm, 6px);
		transition: background 0.15s ease, color 0.15s ease;
	}
	.bk-close:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.bk-body {
		padding: 22px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.bk-desc {
		margin: 0;
		font-size: 13.5px;
		color: var(--muted-foreground);
		line-height: 1.55;
	}
	.bk-cards {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.bk-card {
		display: flex;
		gap: 16px;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 10px);
		padding: 16px;
		align-items: flex-start;
	}
	.bk-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 42px;
		border-radius: var(--radius-sm, 8px);
		background: var(--accent-soft);
		color: var(--accent);
		flex-shrink: 0;
	}
	.bk-card-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}
	.bk-card-info h3 {
		margin: 0;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--foreground);
	}
	.bk-card-info p {
		margin: 0 0 8px 0;
		font-size: 12.5px;
		color: var(--muted-foreground);
		line-height: 1.45;
	}
	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-start;
		padding: 7px 14px;
		font-size: 13px;
		font-weight: 500;
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid transparent;
	}
	.action-btn.primary {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.action-btn.primary:hover:not(:disabled) {
		opacity: 0.92;
	}
	.action-btn.secondary {
		background: var(--muted);
		color: var(--foreground);
		border-color: var(--border);
	}
	.action-btn.secondary:hover:not(:disabled) {
		background: var(--border);
	}
	.action-btn.danger {
		background: var(--destructive);
		color: var(--destructive-foreground, #fff);
	}
	.action-btn.danger:hover:not(:disabled) {
		opacity: 0.92;
	}
	.action-btn.ghost {
		background: none;
		color: var(--muted-foreground);
	}
	.action-btn.ghost:hover {
		color: var(--foreground);
	}
	.restore-preview {
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md, 10px);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.restore-preview h4 {
		margin: 0;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--accent);
	}
	.preview-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.preview-stats li {
		font-size: 12.5px;
		color: var(--foreground);
		background: var(--background);
		padding: 4px 10px;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--border);
	}
	.preview-stats strong {
		color: var(--accent);
	}
	.restore-actions {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}
	.status-msg {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: var(--radius-sm, 8px);
		background: var(--accent-soft);
		color: var(--foreground);
		font-size: 13px;
	}
	.status-msg :global(.material-symbols-outlined) {
		color: #10b981;
		font-size: 18px;
	}
	.status-msg.error {
		background: rgba(239, 68, 68, 0.12);
		color: #ef4444;
	}
	.status-msg.error :global(.material-symbols-outlined) {
		color: #ef4444;
	}
</style>
