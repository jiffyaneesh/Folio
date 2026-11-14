<script lang="ts">
	import Icon from './Icon.svelte';
	import { app, addVisualFlashcard, addVisualNote } from '../state.svelte';

	interface Props {
		open: boolean;
		page: number;
		dataUrl: string;
		onclose: () => void;
	}

	let { open, page, dataUrl, onclose }: Props = $props();

	let mode = $state<'flashcard' | 'note'>('flashcard');
	let front = $state('');
	let back = $state('');
	let noteBody = $state('');
	let copied = $state(false);
	let saving = $state(false);

	async function save() {
		if (!app.doc) return;
		saving = true;
		try {
			if (mode === 'flashcard') {
				await addVisualFlashcard(
					app.doc.id,
					page,
					front.trim() || `Figure on Page ${page}`,
					back.trim() || 'See diagram',
					dataUrl
				);
			} else {
				await addVisualNote(
					app.doc.id,
					page,
					noteBody.trim() || `Figure on Page ${page}`,
					dataUrl
				);
			}
			onclose();
		} catch (e) {
			console.error('Failed to save visual item', e);
		} finally {
			saving = false;
		}
	}

	async function copyImage() {
		try {
			const res = await fetch(dataUrl);
			const blob = await res.blob();
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob })
			]);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback: copy dataUrl text
			try {
				await navigator.clipboard.writeText(dataUrl);
				copied = true;
				setTimeout(() => (copied = false), 2000);
			} catch {}
		}
	}

	function downloadImage() {
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = `${app.doc?.name || 'document'}-page-${page}-snip.png`;
		a.click();
	}

	function autoFocus(node: HTMLElement) {
		setTimeout(() => node.focus(), 50);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onclose();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && open) {
			e.preventDefault();
			save();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="snip-backdrop" onclick={onclose} role="presentation">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<div
			class="snip-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="snip-title"
			tabindex="-1"
		>
			<div class="snip-head">
				<div class="snip-title-row">
					<Icon name="crop" />
					<h2 id="snip-title">Diagram &amp; Formula Snip</h2>
					<span class="snip-page-badge">Pg. {page}</span>
				</div>
				<button class="snip-close" onclick={onclose} aria-label="Close dialog">
					<Icon name="close" />
				</button>
			</div>

			<div class="snip-body">
				<div class="snip-preview-box">
					<img src={dataUrl} alt="Clipped visual diagram" class="snip-img" />
					<div class="snip-preview-actions">
						<button class="snip-tool-btn" onclick={copyImage} title="Copy image to clipboard">
							<Icon name={copied ? 'check' : 'content_copy'} />
							<span>{copied ? 'Copied!' : 'Copy'}</span>
						</button>
						<button class="snip-tool-btn" onclick={downloadImage} title="Download PNG file">
							<Icon name="file_download" />
							<span>Download</span>
						</button>
					</div>
				</div>

				<div class="snip-form">
					<div class="snip-tabs">
						<button
							class="snip-tab"
							class:active={mode === 'flashcard'}
							onclick={() => (mode = 'flashcard')}
						>
							<Icon name="cycle" />
							Active Recall Flashcard
						</button>
						<button
							class="snip-tab"
							class:active={mode === 'note'}
							onclick={() => (mode = 'note')}
						>
							<Icon name="edit_note" />
							Visual Page Note
						</button>
					</div>

					{#if mode === 'flashcard'}
						<div class="form-group">
							<label for="snip-front">Question / Front Prompt</label>
							<input
								id="snip-front"
								type="text"
								placeholder="e.g. What structure is labeled here? Or formula name?"
								bind:value={front}
								use:autoFocus
							/>
						</div>
						<div class="form-group">
							<label for="snip-back">Answer / Explanation</label>
							<textarea
								id="snip-back"
								rows="3"
								placeholder="e.g. Kirchhoff's Current Law: sum of currents entering a node equals zero."
								bind:value={back}
							></textarea>
						</div>
					{:else}
						<div class="form-group">
							<label for="snip-note">Note description</label>
							<textarea
								id="snip-note"
								rows="4"
								placeholder="Add comments or explanations for this visual snippet…"
								bind:value={noteBody}
								use:autoFocus
							></textarea>
						</div>
					{/if}
				</div>
			</div>

			<div class="snip-foot">
				<span class="snip-hint">⌘↵ to save</span>
				<div class="snip-foot-actions">
					<button class="snip-cancel-btn" onclick={onclose}>Cancel</button>
					<button class="snip-save-btn" onclick={save} disabled={saving}>
						{saving ? 'Saving…' : mode === 'flashcard' ? 'Save Flashcard' : 'Save Note'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.snip-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		z-index: 120;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		animation: snip-fade 0.15s ease-out;
	}
	.snip-modal {
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 16px);
		box-shadow: var(--shadow-elevated, 0 20px 40px -10px rgba(0, 0, 0, 0.4));
		width: 100%;
		max-width: 580px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: snip-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.snip-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-bottom: 1px solid var(--border);
	}
	.snip-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--accent);
	}
	.snip-title-row h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--foreground);
	}
	.snip-page-badge {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		background: var(--muted);
		color: var(--muted-foreground);
		padding: 2px 6px;
		border-radius: 4px;
	}
	.snip-close {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 6px;
		border-radius: var(--radius-sm, 6px);
		transition: background 0.12s ease, color 0.12s ease;
	}
	.snip-close:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.snip-body {
		padding: 18px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.snip-preview-box {
		position: relative;
		border-radius: var(--radius, 10px);
		overflow: hidden;
		background: #ffffff;
		border: 1px solid var(--border);
		box-shadow: var(--shadow-subtle);
		display: flex;
		justify-content: center;
		align-items: center;
		max-height: 240px;
		padding: 10px;
	}
	.snip-img {
		max-width: 100%;
		max-height: 220px;
		object-fit: contain;
		border-radius: 4px;
	}
	.snip-preview-actions {
		position: absolute;
		bottom: 8px;
		right: 8px;
		display: flex;
		gap: 6px;
	}
	.snip-tool-btn {
		background: rgba(15, 23, 42, 0.75);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(4px);
		border-radius: var(--radius-sm, 6px);
		padding: 4px 8px;
		font-size: 11px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 4px;
		transition: background 0.12s ease;
	}
	.snip-tool-btn:hover {
		background: rgba(15, 23, 42, 0.95);
	}
	.snip-tool-btn :global(.material-symbols-outlined) {
		font-size: 13px;
	}
	.snip-tabs {
		display: flex;
		gap: 8px;
		border-bottom: 1px solid var(--border);
		padding-bottom: 10px;
		margin-bottom: 12px;
	}
	.snip-tab {
		background: none;
		border: none;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--muted-foreground);
		padding: 6px 10px;
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.snip-tab:hover {
		color: var(--foreground);
		background: var(--muted);
	}
	.snip-tab.active {
		color: var(--primary-foreground);
		background: var(--primary);
		font-weight: 500;
	}
	.snip-tab :global(.material-symbols-outlined) {
		font-size: 16px;
	}
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}
	.form-group label {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted-foreground);
	}
	.form-group input,
	.form-group textarea {
		background: var(--muted);
		border: 1px solid var(--border);
		color: var(--foreground);
		border-radius: var(--radius-sm, 6px);
		padding: 8px 10px;
		font-size: 13px;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s ease;
	}
	.form-group input:focus,
	.form-group textarea:focus {
		border-color: var(--accent);
	}
	.snip-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
		background: var(--card);
	}
	.snip-hint {
		font-size: 11px;
		color: var(--muted-foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.snip-foot-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.snip-cancel-btn {
		background: var(--muted);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		padding: 7px 14px;
		font-size: 12.5px;
		cursor: pointer;
	}
	.snip-save-btn {
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: var(--radius-sm, 6px);
		padding: 7px 16px;
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.12s ease;
	}
	.snip-save-btn:hover {
		opacity: 0.9;
	}
	@keyframes snip-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes snip-pop {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(6px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
