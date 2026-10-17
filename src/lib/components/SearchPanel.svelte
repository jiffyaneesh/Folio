<script lang="ts">
	import { search } from '../search.svelte';

	interface Props {
		ongoto: (page: number) => void;
	}
	let { ongoto }: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (search.open) inputEl?.focus();
	});

	function onInput() {
		search.run();
	}

	function close() {
		search.open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'Enter' && search.hits.length) jump(search.hits[0].page);
	}

	function jump(page: number) {
		ongoto(page);
	}
</script>

{#if search.open}
	<div class="search" role="search" aria-label="In-document search">
		<div class="bar">
			<span class="material-symbols-outlined search-icon">search</span>
			<input
				bind:this={inputEl}
				bind:value={search.query}
				oninput={onInput}
				onkeydown={onKey}
				placeholder={search.building ? 'Indexing pages…' : 'Search in document…'}
				disabled={search.building}
				aria-label="Search term"
			/>
			{#if search.hits.length}
				<span class="count">{search.hits.length}</span>
			{/if}
			<button class="x" onclick={close} aria-label="Close search">
				<span class="material-symbols-outlined">close</span>
			</button>
		</div>

		{#if search.query.trim().length >= 2 && !search.building}
			<div class="results">
				{#if search.hits.length === 0}
					<p class="empty">No matches found</p>
				{:else}
					{#each search.hits as hit (hit.page)}
						<button class="hit" onclick={() => jump(hit.page)}>
							<span class="pg">Pg. {hit.page}</span>
							<span class="snip">{hit.snippet}</span>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.search {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 340px;
		max-width: calc(100% - 28px);
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius, 12px);
		z-index: 50;
		box-shadow: var(--shadow-elevated);
		overflow: hidden;
		animation: drop 0.18s var(--transition-smooth);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
	}
	.search-icon {
		font-size: 18px;
		color: var(--muted-foreground);
	}
	.bar input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--foreground);
		font: inherit;
		font-size: 13px;
		min-width: 0;
	}
	.bar input::placeholder {
		color: var(--muted-foreground);
	}
	.count {
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		color: var(--accent);
		background: var(--accent-soft);
		padding: 1px 6px;
		border-radius: var(--radius-sm, 6px);
		font-weight: 500;
	}
	.x {
		background: none;
		border: none;
		color: var(--muted-foreground);
		display: flex;
		cursor: pointer;
		padding: 3px;
		border-radius: var(--radius-sm, 4px);
		transition: color 0.15s ease;
	}
	.x:hover {
		color: var(--foreground);
	}
	.x .material-symbols-outlined {
		font-size: 16px;
	}
	.results {
		max-height: 280px;
		overflow-y: auto;
		border-top: 1px solid var(--border);
		padding: 4px;
	}
	.empty {
		font-size: 12px;
		color: var(--muted-foreground);
		text-align: center;
		padding: 16px;
		margin: 0;
	}
	.hit {
		display: flex;
		gap: 10px;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 8px 10px;
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		color: var(--foreground);
		transition: background 0.12s ease;
	}
	.hit:hover {
		background: var(--muted);
	}
	.pg {
		flex-shrink: 0;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--primary);
		min-width: 38px;
		padding-top: 1px;
		font-weight: 500;
	}
	.snip {
		font-size: 12px;
		line-height: 1.45;
		color: var(--foreground);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (pointer: coarse) {
		.bar {
			padding: 12px;
		}
		.x {
			min-width: 36px;
			min-height: 36px;
			align-items: center;
			justify-content: center;
		}
		.hit {
			padding: 12px 10px;
		}
	}
</style>
