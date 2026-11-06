import type { PDFDocumentProxy } from './pdf';
import { app } from './state.svelte';

class TextToSpeechState {
	active = $state(false);
	isPlaying = $state(false);
	isPaused = $state(false);
	rate = $state(1.0);
	currentPage = $state(1);
	autoAdvance = $state(true);
	voices = $state<SpeechSynthesisVoice[]>([]);
	selectedVoiceURI = $state<string>('');
	readingProgress = $state(0); // 0 to 100%

	#utterance: SpeechSynthesisUtterance | null = null;
	#currentDoc: PDFDocumentProxy | null = null;
	#nextPageCallback: ((page: number) => void) | null = null;

	constructor() {
		this.#initVoices();
	}

	#initVoices() {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

		const updateVoices = () => {
			const v = window.speechSynthesis.getVoices();
			this.voices = v;
			if (!this.selectedVoiceURI && v.length > 0) {
				const defaultVoice = v.find((x) => x.default || x.lang.startsWith('en')) || v[0];
				this.selectedVoiceURI = defaultVoice.voiceURI;
			}
		};

		updateVoices();
		if (window.speechSynthesis.onvoiceschanged !== undefined) {
			window.speechSynthesis.onvoiceschanged = updateVoices;
		}
	}

	async readPage(
		doc: PDFDocumentProxy,
		pageNumber: number,
		onPageChange?: (page: number) => void
	) {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

		this.stop();
		this.active = true;
		this.#currentDoc = doc;
		this.currentPage = pageNumber;
		if (onPageChange) this.#nextPageCallback = onPageChange;

		try {
			const page = await doc.getPage(pageNumber);
			const textContent = await page.getTextContent();
			const text = textContent.items
				.map((it) => ('str' in it ? it.str : ''))
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			page.cleanup();

			if (!text) {
				// Empty page or scan without text layer
				if (this.autoAdvance && pageNumber < doc.numPages) {
					this.readPage(doc, pageNumber + 1, onPageChange);
				} else {
					this.stop();
				}
				return;
			}

			const utt = new SpeechSynthesisUtterance(text);
			utt.rate = this.rate;

			if (this.selectedVoiceURI) {
				const voice = this.voices.find((v) => v.voiceURI === this.selectedVoiceURI);
				if (voice) utt.voice = voice;
			}

			utt.onboundary = (e) => {
				if (e.name === 'word' && text.length > 0) {
					this.readingProgress = Math.min(100, Math.round((e.charIndex / text.length) * 100));
				}
			};

			utt.onend = () => {
				this.isPlaying = false;
				this.isPaused = false;
				this.readingProgress = 100;

				if (this.autoAdvance && this.#currentDoc && this.currentPage < this.#currentDoc.numPages) {
					const nextPg = this.currentPage + 1;
					this.currentPage = nextPg;
					this.#nextPageCallback?.(nextPg);
					this.readPage(this.#currentDoc, nextPg, this.#nextPageCallback ?? undefined);
				} else {
					this.stop();
				}
			};

			utt.onerror = (e) => {
				if (e.error !== 'canceled' && e.error !== 'interrupted') {
					console.warn('[Folio TTS] Error:', e);
				}
				this.isPlaying = false;
				this.isPaused = false;
			};

			this.#utterance = utt;
			this.isPlaying = true;
			this.isPaused = false;
			window.speechSynthesis.speak(utt);
		} catch (err) {
			console.warn('[Folio TTS] Failed to read page:', err);
			this.stop();
		}
	}

	pause() {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		if (this.isPlaying && !this.isPaused) {
			window.speechSynthesis.pause();
			this.isPaused = true;
		}
	}

	resume() {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		if (this.isPaused) {
			window.speechSynthesis.resume();
			this.isPaused = false;
		}
	}

	toggle(doc?: PDFDocumentProxy | null, pageNumber?: number, onPageChange?: (p: number) => void) {
		if (!this.active) {
			if (doc) {
				this.readPage(doc, pageNumber || app.currentPage, onPageChange);
			}
			return;
		}

		if (this.isPaused) {
			this.resume();
		} else if (this.isPlaying) {
			this.pause();
		} else if (doc) {
			this.readPage(doc, pageNumber || app.currentPage, onPageChange);
		}
	}

	setRate(newRate: number) {
		this.rate = newRate;
		if (this.isPlaying && this.#currentDoc) {
			const pg = this.currentPage;
			const cb = this.#nextPageCallback;
			this.readPage(this.#currentDoc, pg, cb ?? undefined);
		}
	}

	setVoice(uri: string) {
		this.selectedVoiceURI = uri;
		if (this.isPlaying && this.#currentDoc) {
			const pg = this.currentPage;
			const cb = this.#nextPageCallback;
			this.readPage(this.#currentDoc, pg, cb ?? undefined);
		}
	}

	stop() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
		}
		this.active = false;
		this.isPlaying = false;
		this.isPaused = false;
		this.readingProgress = 0;
		this.#utterance = null;
	}
}

export const tts = new TextToSpeechState();
