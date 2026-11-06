<script lang="ts">
	import { ICONS } from '../icons';

	interface Props {
		name: string;
		class?: string;
		size?: number | string;
	}

	let { name, class: className = '', size }: Props = $props();

	const path = $derived(ICONS[name] || '');
</script>

{#if path}
	<svg
		class="material-symbols-outlined folio-svg-icon {className}"
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="currentColor"
		aria-hidden="true"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html path}
	</svg>
{:else}
	<span class="material-symbols-outlined {className}">{name}</span>
{/if}

<style>
	.folio-svg-icon {
		display: inline-block;
		width: 1em;
		height: 1em;
		vertical-align: -0.15em;
		fill: currentColor;
		flex-shrink: 0;
	}
</style>
