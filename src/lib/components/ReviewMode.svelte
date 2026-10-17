<script lang="ts">
	import { reviewCard } from '../state.svelte';
	import { isDue } from '../sm2';
	import type { FlashcardRecord } from '../types';

	interface Props {
		cards: FlashcardRecord[];
		onclose: () => void;
	}
	let { cards, onclose }: Props = $props();

	function getInitialQueue() {
		return cards.filter((c) => isDue(c, Date.now()));
	}
	let queue = $state<FlashcardRecord[]>(getInitialQueue());
	let idx = $state(0);
	let flipped = $state(false);
	let done = $derived(idx >= queue.length);

	const current = $derived(queue[idx]);

	async function grade(quality: number) {
		if (!current) return;
		await reviewCard($state.snapshot(current), quality);
		flipped = false;
		idx += 1;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		else if (e.key === ' ') {
			e.preventDefault();
			flipped = !flipped;
		} else if (flipped && current) {
			if (e.key === '1') grade(2);
			else if (e.key === '2') grade(3);
			else if (e.key === '3') grade(4);
			else if (e.key === '4') grade(5);
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="overlay" role="dialog" aria-modal="true" aria-label="Active Recall Review">
	<div class="sheet">
		<header class="sheet-head">
			<div class="head-meta">
				<span class="material-symbols-outlined">style</span>
				Active Recall
			</div>
			<div class="counter">
				{#if !done}{Math.min(idx + 1, queue.length)} / {queue.length}{:else}Done{/if}
			</div>
			<button class="close" onclick={onclose} aria-label="Close review dialog">
				<span class="material-symbols-outlined">close</span>
			</button>
		</header>

		{#if done}
			<div class="empty">
				<span class="material-symbols-outlined big">task_alt</span>
				<p class="empty-title">All caught up</p>
				<p class="empty-sub">
					{queue.length
						? `Reviewed ${queue.length} card${queue.length > 1 ? 's' : ''}.`
						: 'No cards due right now.'}
				</p>
				<button class="primary" onclick={onclose}>Close</button>
			</div>
		{:else if current}
			<button class="card" class:flipped onclick={() => (flipped = !flipped)}>
				<div class="card-side front">
					<span class="side-label">Citation Prompt</span>
					<p>{current.front}</p>
					<span class="hint">Tap or press space to reveal answer</span>
				</div>
				{#if flipped}
					<div class="card-side back">
						<span class="side-label">Your Note / Key Insight</span>
						<p>{current.back || 'No note attached to this citation.'}</p>
					</div>
				{/if}
			</button>

			{#if flipped}
				<div class="grades">
					<button class="grade again" onclick={() => grade(2)}>
						<span>Again</span>
						<span class="key-hint">1</span>
					</button>
					<button class="grade hard" onclick={() => grade(3)}>
						<span>Hard</span>
						<span class="key-hint">2</span>
					</button>
					<button class="grade good" onclick={() => grade(4)}>
						<span>Good</span>
						<span class="key-hint">3</span>
					</button>
					<button class="grade easy" onclick={() => grade(5)}>
						<span>Easy</span>
						<span class="key-hint">4</span>
					</button>
				</div>
			{:else}
				<div class="prompt-hint">Recall the answer, then flip</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
		animation: fade 0.2s var(--transition-smooth);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.sheet {
		width: 100%;
		max-width: 480px;
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl, 18px);
		padding: 22px;
		box-shadow: var(--shadow-elevated);
		animation: rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.98);
		}
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 18px;
	}
	.head-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--foreground);
	}
	.head-meta .material-symbols-outlined {
		font-size: 18px;
		color: var(--accent);
	}
	.counter {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.close {
		background: transparent;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		padding: 2px;
		border-radius: var(--radius-sm, 4px);
		transition: color 0.15s ease;
	}
	.close:hover {
		color: var(--foreground);
	}
	.card {
		width: 100%;
		min-height: 230px;
		text-align: left;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 12px);
		padding: 22px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 14px;
		transition: border-color 0.15s ease;
	}
	.card:hover {
		border-color: var(--accent);
	}
	.card-side {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card-side.back {
		border-top: 1px solid var(--border);
		padding-top: 14px;
		animation: fade 0.18s ease;
	}
	.side-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-foreground);
		font-weight: 500;
	}
	.card-side p {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--foreground);
	}
	.card-side.back p {
		font-size: 14.5px;
		color: var(--foreground);
	}
	.hint {
		margin-top: auto;
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.grades {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-top: 16px;
	}
	.grade {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 0;
		border-radius: var(--radius-md, 8px);
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--foreground);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.grade:hover {
		background: var(--muted);
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.again:hover {
		border-color: var(--destructive);
		color: var(--destructive);
	}
	.key-hint {
		font-size: 10px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		color: var(--muted-foreground);
	}
	.prompt-hint {
		text-align: center;
		margin-top: 16px;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 32px 0;
		text-align: center;
	}
	.material-symbols-outlined.big {
		font-size: 44px;
		color: var(--accent);
	}
	.empty-title {
		font-size: 16px;
		color: var(--foreground);
		margin: 4px 0 0;
		font-weight: 500;
	}
	.empty-sub {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0 0 12px;
	}
	.primary {
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: var(--radius-md, 8px);
		padding: 8px 22px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
</style>
