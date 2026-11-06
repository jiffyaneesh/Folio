<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	const groups = [
		{
			title: 'Navigation',
			shortcuts: [
				{ keys: ['J', '→'], desc: 'Next page (or spread)' },
				{ keys: ['K', '←'], desc: 'Previous page (or spread)' },
				{ keys: ['PgUp', 'PgDn'], desc: 'Page scroll' },
				{ keys: ['⌘', 'B'], desc: 'Bookmark current page' },
				{ keys: ['Click Pg'], desc: 'Quick jump to any page' }
			]
		},
		{
			title: 'Reading & Layout',
			shortcuts: [
				{ keys: ['D'], desc: 'Toggle single / two-page spread' },
				{ keys: ['P'], desc: 'Cycle paper: Normal / Sepia / Inverted' },
				{ keys: ['Z'], desc: 'Zen focus mode (fullscreen)' },
				{ keys: ['+', '−'], desc: 'Zoom in / Zoom out' },
				{ keys: ['0'], desc: 'Reset zoom to 100%' }
			]
		},
		{
			title: 'Tools & Study',
			shortcuts: [
				{ keys: ['⌘', 'F'], desc: 'Search document text' },
				{ keys: ['Select text'], desc: 'Highlight color palette' },
				{ keys: ['⌘', '↵'], desc: 'Save note or flashcard' },
				{ keys: ['T'], desc: 'Toggle Text-to-Speech audio reader' },
				{ keys: ['?'], desc: 'Show this shortcuts guide' },
				{ keys: ['Esc'], desc: 'Close open overlay or exit Zen' }
			]
		}
	];

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="sc-backdrop" onclick={onclose} role="presentation">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="sc-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="sc-title"
			tabindex="-1"
		>
			<div class="sc-head">
				<div class="sc-title-group">
					<span class="sc-icon">
						<Icon name="help_outline" />
					</span>
					<h2 id="sc-title">Keyboard Shortcuts</h2>
				</div>
				<button class="sc-close" onclick={onclose} aria-label="Close shortcuts dialog">
					<Icon name="close" />
				</button>
			</div>

			<div class="sc-body">
				{#each groups as g}
					<div class="sc-group">
						<h3 class="sc-group-title">{g.title}</h3>
						<div class="sc-list">
							{#each g.shortcuts as s}
								<div class="sc-row">
									<span class="sc-desc">{s.desc}</span>
									<div class="sc-keys">
										{#each s.keys as k}
											<kbd class="sc-kbd">{k}</kbd>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="sc-foot">
				<span>Press <kbd class="sc-kbd">?</kbd> anytime to open</span>
				<button class="sc-btn" onclick={onclose}>Got it</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.sc-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		animation: sc-fade-in 0.15s ease-out;
	}
	.sc-modal {
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 16px);
		box-shadow: var(--shadow-elevated, 0 20px 40px -10px rgba(0, 0, 0, 0.4));
		width: 100%;
		max-width: 540px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: sc-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.sc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}
	.sc-title-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.sc-icon {
		color: var(--accent);
		display: flex;
		align-items: center;
	}
	.sc-title-group h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.sc-close {
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border-radius: var(--radius-sm, 6px);
		transition: background 0.12s ease, color 0.12s ease;
	}
	.sc-close:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.sc-body {
		padding: 18px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.sc-group-title {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}
	.sc-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sc-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
		font-size: 13px;
	}
	.sc-desc {
		color: var(--foreground);
	}
	.sc-keys {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.sc-kbd {
		background: var(--muted);
		border: 1px solid var(--border);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		padding: 2px 7px;
		font-size: 11px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-weight: 600;
		color: var(--foreground);
		min-width: 20px;
		text-align: center;
	}
	.sc-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		border-top: 1px solid var(--border);
		background: var(--card);
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.sc-btn {
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: var(--radius-sm, 6px);
		padding: 6px 14px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.12s ease;
	}
	.sc-btn:hover {
		opacity: 0.9;
	}
	@keyframes sc-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes sc-pop {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(4px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
