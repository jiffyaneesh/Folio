<script lang="ts">
	import Icon from './Icon.svelte';
	import { db } from '../db';
	import type { DocumentRecord, HighlightRecord, NoteRecord, FlashcardRecord, BookmarkRecord } from '../types';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	let loading = $state(true);
	let docs = $state<DocumentRecord[]>([]);
	let highlights = $state<HighlightRecord[]>([]);
	let notes = $state<NoteRecord[]>([]);
	let flashcards = $state<FlashcardRecord[]>([]);
	let bookmarks = $state<BookmarkRecord[]>([]);

	$effect(() => {
		if (open) {
			loading = true;
			Promise.all([
				db.documents.toArray(),
				db.highlights.toArray(),
				db.notes.toArray(),
				db.flashcards.toArray(),
				db.bookmarks.toArray()
			]).then(([d, h, n, f, b]) => {
				docs = d;
				highlights = h;
				notes = n;
				flashcards = f;
				bookmarks = b;
				loading = false;
			}).catch((err) => {
				console.error('Failed to load stats', err);
				loading = false;
			});
		}
	});

	// Analytics derivations
	const totalSeconds = $derived(docs.reduce((acc, d) => acc + (d.sessionTime || 0), 0));
	const formattedTime = $derived.by(() => {
		const mins = Math.floor(totalSeconds / 60);
		if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		return `${hrs}h ${remMins}m`;
	});

	const totalPagesRead = $derived(docs.reduce((acc, d) => acc + (d.lastPage || 1), 0));
	const totalPagesLibrary = $derived(docs.reduce((acc, d) => acc + (d.totalPages || 1), 0));
	const completionRate = $derived(
		totalPagesLibrary > 0 ? Math.round((totalPagesRead / totalPagesLibrary) * 100) : 0
	);

	const completedBooks = $derived(
		docs.filter((d) => d.totalPages > 0 && d.lastPage >= d.totalPages).length
	);

	// SM-2 Flashcard metrics
	const masteredCards = $derived(flashcards.filter((c) => c.repetition >= 3).length);
	const learningCards = $derived(flashcards.filter((c) => c.repetition < 3).length);
	const masteryRate = $derived(
		flashcards.length > 0 ? Math.round((masteredCards / flashcards.length) * 100) : 0
	);

	// Visual Snips
	const visualItemsCount = $derived(
		notes.filter((n) => n.imageUrl).length + flashcards.filter((c) => c.imageUrl).length
	);

	// Category counts
	const ideaCount = $derived(highlights.filter((h) => h.color.includes('245')).length);
	const factCount = $derived(highlights.filter((h) => h.color.includes('59')).length);
	const quoteCount = $derived(highlights.filter((h) => h.color.includes('16')).length);
	const questionCount = $derived(highlights.filter((h) => h.color.includes('244')).length);

	// Reading streak calculation
	const streakDays = $derived.by(() => {
		const dateSet = new Set<string>();
		const toDateKey = (ms: number) => {
			const d = new Date(ms);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		};

		for (const d of docs) {
			if (d.lastOpenedAt) dateSet.add(toDateKey(d.lastOpenedAt));
			if (d.addedAt) dateSet.add(toDateKey(d.addedAt));
		}
		for (const h of highlights) dateSet.add(toDateKey(h.createdAt));
		for (const n of notes) dateSet.add(toDateKey(n.createdAt));

		if (dateSet.size === 0) return 0;

		const todayKey = toDateKey(Date.now());
		const yesterdayKey = toDateKey(Date.now() - 86400000);

		let current = dateSet.has(todayKey) ? Date.now() : dateSet.has(yesterdayKey) ? Date.now() - 86400000 : null;
		if (!current) return 0;

		let streak = 0;
		while (true) {
			const key = toDateKey(current);
			if (dateSet.has(key)) {
				streak++;
				current -= 86400000;
			} else {
				break;
			}
		}
		return streak;
	});

	// Last 7 days activity
	const last7Days = $derived.by(() => {
		const days = [];
		const dateSet = new Set<string>();
		const toDateKey = (ms: number) => {
			const d = new Date(ms);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		};

		for (const d of docs) if (d.lastOpenedAt) dateSet.add(toDateKey(d.lastOpenedAt));
		for (const h of highlights) dateSet.add(toDateKey(h.createdAt));
		for (const n of notes) dateSet.add(toDateKey(n.createdAt));

		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		for (let i = 6; i >= 0; i--) {
			const time = Date.now() - i * 86400000;
			const d = new Date(time);
			const key = toDateKey(time);
			days.push({
				label: dayNames[d.getDay()],
				date: d.getDate(),
				active: dateSet.has(key)
			});
		}
		return days;
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="st-backdrop" onclick={onclose} role="presentation">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<div
			class="st-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="st-title"
			tabindex="-1"
		>
			<div class="st-head">
				<div class="st-title-row">
					<Icon name="bar_chart" />
					<h2 id="st-title">Study &amp; Reading Insights</h2>
				</div>
				<button class="st-close" onclick={onclose} aria-label="Close dialog">
					<Icon name="close" />
				</button>
			</div>

			<div class="st-body">
				{#if loading}
					<div class="st-loading">
						<Icon name="progress_activity" class="spin" />
						<span>Gathering analytics…</span>
					</div>
				{:else}
					<!-- Top Metrics Grid -->
					<div class="metrics-grid">
						<div class="metric-card">
							<span class="m-label">Total Reading Time</span>
							<div class="m-val-row">
								<span class="m-val">{formattedTime}</span>
							</div>
							<span class="m-sub">Across {docs.length} document{docs.length === 1 ? '' : 's'}</span>
						</div>

						<div class="metric-card streak-card">
							<span class="m-label">Reading Streak</span>
							<div class="m-val-row">
								<span class="m-val">{streakDays}</span>
								<span class="streak-flame"><Icon name="local_fire_department" /></span>
							</div>
							<span class="m-sub">{streakDays > 1 ? 'Days in a row' : streakDays === 1 ? 'Active today' : 'Start your streak today'}</span>
						</div>

						<div class="metric-card">
							<span class="m-label">Pages Explored</span>
							<div class="m-val-row">
								<span class="m-val">{totalPagesRead}</span>
								<span class="m-sub-val">/ {totalPagesLibrary}</span>
							</div>
							<span class="m-sub">{completedBooks} book{completedBooks === 1 ? '' : 's'} completed</span>
						</div>

						<div class="metric-card">
							<span class="m-label">Recall Mastery</span>
							<div class="m-val-row">
								<span class="m-val">{masteryRate}%</span>
							</div>
							<span class="m-sub">{masteredCards} of {flashcards.length} cards mastered</span>
						</div>
					</div>

					<!-- Weekly Activity Tracker -->
					<div class="section-card">
						<div class="sec-head">
							<span class="sec-title">7-Day Study Activity</span>
							<span class="sec-badge">{streakDays > 0 ? `${streakDays} Day Streak` : 'Offline tracker'}</span>
						</div>
						<div class="week-strip">
							{#each last7Days as day}
								<div class="day-slot" class:active={day.active}>
									<span class="day-name">{day.label}</span>
									<div class="day-dot-box">
										<span class="day-indicator"></span>
									</div>
									<span class="day-num">{day.date}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Knowledge & Annotations Distribution -->
					<div class="section-card">
						<div class="sec-head">
							<span class="sec-title">Annotations Breakdown</span>
							<span class="sec-badge">{highlights.length + notes.length} total</span>
						</div>

						<div class="hl-cats-grid">
							<div class="cat-stat ideas">
								<span class="cat-pill ideas">Ideas</span>
								<span class="cat-num">{ideaCount}</span>
							</div>
							<div class="cat-stat facts">
								<span class="cat-pill facts">Facts</span>
								<span class="cat-num">{factCount}</span>
							</div>
							<div class="cat-stat quotes">
								<span class="cat-pill quotes">Quotes</span>
								<span class="cat-num">{quoteCount}</span>
							</div>
							<div class="cat-stat questions">
								<span class="cat-pill questions">Questions</span>
								<span class="cat-num">{questionCount}</span>
							</div>
						</div>

						<div class="extra-stats-row">
							<div class="extra-stat">
								<Icon name="edit_note" />
								<span>{notes.length} Notes Written</span>
							</div>
							<div class="extra-stat">
								<Icon name="crop" />
								<span>{visualItemsCount} Diagrams Snipped</span>
							</div>
							<div class="extra-stat">
								<Icon name="bookmark" />
								<span>{bookmarks.length} Bookmarks Saved</span>
							</div>
						</div>
					</div>

					<!-- Top Reading Items -->
					{#if docs.length > 0}
						<div class="section-card">
							<div class="sec-head">
								<span class="sec-title">Library Progress</span>
								<span class="sec-badge">{completionRate}% library read</span>
							</div>
							<div class="doc-list-preview">
								{#each docs.slice(0, 4) as d}
									<div class="doc-row-preview">
										<div class="doc-info-col">
											<span class="doc-p-name">{d.name}</span>
											<span class="doc-p-meta">
												Pg. {d.lastPage || 1} / {d.totalPages || 1} · {Math.round(((d.lastPage || 1) / (d.totalPages || 1)) * 100)}%
											</span>
										</div>
										<div class="doc-prog-track">
											<div
												class="doc-prog-fill"
												style="width: {Math.min(100, Math.round(((d.lastPage || 1) / (d.totalPages || 1)) * 100))}%"
											></div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.st-backdrop {
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
		animation: stFade 0.15s ease-out;
	}
	@keyframes stFade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.st-modal {
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg, 14px);
		width: 100%;
		max-width: 640px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	.st-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 22px;
		border-bottom: 1px solid var(--border);
	}
	.st-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--foreground);
	}
	.st-title-row h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.st-title-row :global(.material-symbols-outlined) {
		color: var(--accent);
		font-size: 22px;
	}
	.st-close {
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
	.st-close:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.st-body {
		padding: 22px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.st-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px;
		gap: 12px;
		color: var(--muted-foreground);
		font-size: 14px;
	}
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}
	@media (min-width: 520px) {
		.metrics-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.metric-card {
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 10px);
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.m-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted-foreground);
		font-weight: 500;
	}
	.m-val-row {
		display: flex;
		align-items: baseline;
		gap: 4px;
		margin: 4px 0 2px 0;
	}
	.m-val {
		font-size: 22px;
		font-weight: 700;
		color: var(--foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.m-sub-val {
		font-size: 13px;
		color: var(--muted-foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.streak-card .m-val {
		color: #f59e0b;
	}
	.streak-flame :global(.material-symbols-outlined) {
		color: #f59e0b;
		font-size: 20px;
		vertical-align: middle;
	}
	.m-sub {
		font-size: 11.5px;
		color: var(--muted-foreground);
		line-height: 1.35;
	}
	.section-card {
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 10px);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.sec-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sec-title {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--foreground);
	}
	.sec-badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 12px;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 500;
	}
	.week-strip {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.day-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		flex: 1;
	}
	.day-name {
		font-size: 10.5px;
		color: var(--muted-foreground);
		text-transform: uppercase;
	}
	.day-dot-box {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--muted);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}
	.day-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: transparent;
	}
	.day-slot.active .day-dot-box {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.day-slot.active .day-indicator {
		background: var(--accent);
	}
	.day-num {
		font-size: 11px;
		color: var(--foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.hl-cats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.cat-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 10px 4px;
		border-radius: var(--radius-sm, 6px);
		background: var(--background);
		border: 1px solid var(--border);
	}
	.cat-pill {
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.cat-pill.ideas {
		color: #f59e0b;
	}
	.cat-pill.facts {
		color: #3b82f6;
	}
	.cat-pill.quotes {
		color: #10b981;
	}
	.cat-pill.questions {
		color: #f43f5e;
	}
	.cat-num {
		font-size: 16px;
		font-weight: 700;
		color: var(--foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.extra-stats-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		padding-top: 6px;
		border-top: 1px solid var(--border);
	}
	.extra-stat {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		color: var(--muted-foreground);
	}
	.extra-stat :global(.material-symbols-outlined) {
		font-size: 16px;
		color: var(--accent);
	}
	.doc-list-preview {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.doc-row-preview {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.doc-info-col {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.doc-p-name {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 65%;
	}
	.doc-p-meta {
		font-size: 11px;
		color: var(--muted-foreground);
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	.doc-prog-track {
		height: 4px;
		background: var(--muted);
		border-radius: 2px;
		overflow: hidden;
	}
	.doc-prog-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
	}
</style>
