<script lang="ts">
	import { tts } from '../tts.svelte';
	import { app } from '../state.svelte';
	import type { PDFDocumentProxy } from '../pdf';

	interface Props {
		doc: PDFDocumentProxy | null;
		ongoto: (page: number) => void;
	}
	let { doc, ongoto }: Props = $props();

	const rates = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0];

	function cycleRate() {
		const curIdx = rates.indexOf(tts.rate);
		const nextIdx = (curIdx + 1) % rates.length;
		tts.setRate(rates[nextIdx]);
	}

	function togglePlay() {
		tts.toggle(doc, app.currentPage, (p) => ongoto(p));
	}

	function close() {
		tts.stop();
	}
</script>

{#if tts.active}
	<aside class="tts-bar fade" aria-label="Audio Reader Controls">
		<div class="tts-progress" style="width: {tts.readingProgress}%;"></div>

		<div class="tts-content">
			<div class="tts-left">
				<span class="material-symbols-outlined tts-icon" class:pulse={tts.isPlaying && !tts.isPaused}>
					volume_up
				</span>
				<div class="tts-meta">
					<span class="tts-title">Page {tts.currentPage}</span>
					<span class="tts-status">
						{#if tts.isPaused}
							Paused
						{:else if tts.isPlaying}
							Reading aloud…
						{:else}
							Ready
						{/if}
					</span>
				</div>
			</div>

			<div class="tts-controls">
				<button
					class="tts-btn play-btn"
					onclick={togglePlay}
					aria-label={tts.isPaused ? 'Resume reading' : 'Pause reading'}
					title={tts.isPaused ? 'Resume' : 'Pause'}
				>
					<span class="material-symbols-outlined">
						{tts.isPaused ? 'play_arrow' : 'pause'}
					</span>
				</button>

				<button
					class="tts-rate"
					onclick={cycleRate}
					title="Cycle speed (0.8x - 2.0x)"
					aria-label={`Reading speed ${tts.rate}x`}
				>
					{tts.rate}x
				</button>

				<button
					class="tts-auto"
					class:active={tts.autoAdvance}
					onclick={() => (tts.autoAdvance = !tts.autoAdvance)}
					title={tts.autoAdvance ? 'Auto-turn page: ON' : 'Auto-turn page: OFF'}
					aria-label="Toggle auto-advance page"
				>
					<span class="material-symbols-outlined">skip_next</span>
				</button>

				<button class="tts-btn close-btn" onclick={close} aria-label="Stop audio reader" title="Stop">
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>
		</div>
	</aside>
{/if}

<style>
	.tts-bar {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 60;
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius, 14px);
		box-shadow: var(--shadow-elevated, 0 12px 32px rgba(0, 0, 0, 0.35));
		width: 330px;
		max-width: calc(100vw - 32px);
		overflow: hidden;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.tts-progress {
		height: 2.5px;
		background: var(--accent);
		transition: width 0.15s linear;
	}
	.tts-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
	}
	.tts-left {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.tts-icon {
		font-size: 20px;
		color: var(--accent);
	}
	.tts-icon.pulse {
		animation: icon-pulse 1.5s infinite;
	}
	@keyframes icon-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.15);
			opacity: 0.8;
		}
	}
	.tts-meta {
		display: flex;
		flex-direction: column;
	}
	.tts-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--foreground);
		line-height: 1.2;
	}
	.tts-status {
		font-size: 10.5px;
		color: var(--muted-foreground);
		line-height: 1.2;
	}
	.tts-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tts-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.tts-btn:hover {
		background: var(--muted);
		border-color: var(--accent);
	}
	.tts-btn .material-symbols-outlined {
		font-size: 16px;
	}
	.play-btn {
		background: var(--accent);
		color: #ffffff;
		border: none;
	}
	.play-btn:hover {
		transform: scale(1.06);
		background: var(--accent);
	}
	.close-btn {
		background: transparent;
		border-color: transparent;
		color: var(--muted-foreground);
	}
	.close-btn:hover {
		color: var(--foreground);
		background: var(--muted);
	}
	.tts-rate {
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.tts-rate:hover {
		color: var(--foreground);
		border-color: var(--accent);
	}
	.tts-auto {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.tts-auto.active {
		color: var(--accent);
	}
	.tts-auto .material-symbols-outlined {
		font-size: 16px;
	}
	.fade {
		animation: pop-up 0.2s var(--transition-smooth);
	}
	@keyframes pop-up {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
