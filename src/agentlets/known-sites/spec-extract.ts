import { squash } from './shared';

/**
 * Reading requirements out of normative documents, for the "Spec to
 * checklist" demo (./spec-checklist.ts). Pure DOM reading: nothing here
 * changes the page.
 *
 * Four readers, chosen by host (see `readSpec`):
 *
 * - WCAG (a W3C page whose success criteria carry a `p.conformance-level`):
 *   one requirement per success criterion, with its level A, AA or AAA.
 * - Other W3C Technical Reports: the block around each `.rfc2119` keyword
 *   (`<em class="rfc2119">MUST</em>`), or, in documents that do not mark the
 *   keywords up, the blocks with an uppercase keyword. One requirement per
 *   sentence with a keyword. Notes, examples and code are skipped.
 * - IETF RFCs on rfc-editor.org: paragraphs, list items and table cells with
 *   an `id` that starts with `section-` or `appendix-`, one requirement per
 *   sentence that holds an uppercase BCP 14 keyword (RFC 2119 and RFC 8174).
 * - EUR-Lex (OJ HTML): one candidate per article paragraph, flagged when it
 *   says "shall" or "must". This one is a heuristic reading aid, not legal
 *   advice, and the panel says so.
 *
 * The markup relied on is the one these sites serve today. Trimmed copies of
 * real pages are the e2e fixtures (tests/e2e/fixtures/known-sites/).
 */

export type SpecSource = 'wcag' | 'w3c' | 'rfc' | 'eurlex';

export interface Requirement {
	/** Stable across reloads of the same document: derived from the page's own ids and order. */
	id: string;
	/** Where it sits: "5.6.3", "3.1", "1.1 Text Alternatives", "Article 5". */
	section: string;
	/** Title of the section, success criterion or article, when the page has one. */
	title: string;
	/** MUST, SHOULD or MAY; A, AA or AAA; Shall or Must. */
	level: string;
	/** The sentence, the success criterion text, or the paragraph. */
	text: string;
	/** An `id` on the page that links to this requirement, without the `#`. May be empty. */
	anchor: string;
	/** The element to scroll to and highlight. */
	element: Element;
}

export interface SpecDocument {
	source: SpecSource;
	/** Short name of the kind of document, for the panel. */
	kind: string;
	/** Document title, for the export file name. */
	title: string;
	/** Level labels in the order the filter lists them. */
	levels: string[];
	requirements: Requirement[];
}

const BCP14 = /\b(MUST NOT|MUST|REQUIRED|SHALL NOT|SHALL|SHOULD NOT|SHOULD|NOT RECOMMENDED|RECOMMENDED|MAY|OPTIONAL)\b/g;
const BCP14_LEVELS = ['MUST', 'SHOULD', 'MAY'];
const RANK: Record<string, number> = { MUST: 3, SHOULD: 2, MAY: 1 };

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|sec|fig|approx)\.$/i;

/** "must" and "shall" in the EUR-Lex reading, whole words, any case. */
const SHALL = /\bshall\b/i;
const MUST = /\bmust\b/i;

/** A sentence from the text of a block. Splits at a full stop, question mark or exclamation mark followed by a capital letter or an opening bracket. */
export function splitSentences(text: string): string[] {
	const parts = squash(text).split(/(?<=[.!?])\s+(?=[A-Z("'‘“])/);
	const sentences: string[] = [];
	for (const part of parts) {
		const last = sentences[sentences.length - 1];
		if (last !== undefined && ABBREVIATIONS.test(last)) sentences[sentences.length - 1] = `${last} ${part}`;
		else sentences.push(part);
	}
	return sentences.filter(Boolean);
}

/** The strongest BCP 14 level in a text (MUST over SHOULD over MAY), or null. */
export function bcp14Level(text: string): string | null {
	let best: string | null = null;
	for (const match of text.matchAll(BCP14)) {
		const word = match[1];
		const level = /^(MUST|REQUIRED|SHALL)/.test(word) ? 'MUST' : /RECOMMENDED|^SHOULD/.test(word) ? 'SHOULD' : 'MAY';
		if (best === null || RANK[level] > RANK[best]) best = level;
	}
	return best;
}

/** Whether a sentence only quotes the keywords ("The key words ... are to be interpreted as described in BCP 14"). */
function isBoilerplate(sentence: string): boolean {
	return /\bBCP\s*14\b/.test(sentence) || /\bRFC\s*2119\b/.test(sentence) || /key words/i.test(sentence);
}

function plainText(element: Element, dropSelector: string): string {
	const copy = element.cloneNode(true) as Element;
	copy.querySelectorAll(dropSelector).forEach((node) => node.remove());
	return squash(copy.textContent ?? '');
}

function headingOf(container: Element): Element | null {
	return container.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > .header-wrapper > h1, :scope > .header-wrapper > h2, :scope > .header-wrapper > h3, :scope > .header-wrapper > h4, :scope > .header-wrapper > h5, :scope > .header-wrapper > h6');
}

/** "5.6.3. Whitespace" becomes number "5.6.3" and name "Whitespace". */
function numberAndName(heading: Element | null): { number: string; name: string } {
	if (!heading) return { number: '', name: '' };
	const secno = heading.querySelector('.secno, .section-number');
	const number = squash(secno?.textContent ?? '').replace(/\.$/, '');
	const name = plainText(heading, '.secno, .section-number, .self-link, .permalink');
	return { number, name };
}

/** The `id` of the element or of its closest ancestor that has one. */
function nearestId(element: Element): string {
	return element.closest('[id]')?.id ?? '';
}

/** Gives each id a unique form: `base`, or `base` plus a letter when several requirements share it. */
function finalizeIds(items: { base: string; requirement: Omit<Requirement, 'id'> }[]): Requirement[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.base, (counts.get(item.base) ?? 0) + 1);
	const seen = new Map<string, number>();
	const used = new Set<string>();
	return items.map(({ base, requirement }) => {
		const index = seen.get(base) ?? 0;
		seen.set(base, index + 1);
		let id = (counts.get(base) ?? 1) > 1 ? `${base}${String.fromCharCode(97 + (index % 26))}${index >= 26 ? String(Math.floor(index / 26)) : ''}` : base;
		while (used.has(id)) id = `${id}x`;
		used.add(id);
		return { id, ...requirement };
	});
}

/** One requirement per sentence of a block that holds a BCP 14 keyword. */
function sentenceRequirements(
	block: Element,
	text: string,
	base: string,
	section: string,
	title: string,
	anchor: string,
): { base: string; requirement: Omit<Requirement, 'id'> }[] {
	const found: { base: string; requirement: Omit<Requirement, 'id'> }[] = [];
	for (const sentence of splitSentences(text)) {
		if (isBoilerplate(sentence)) continue;
		const level = bcp14Level(sentence);
		if (!level) continue;
		found.push({ base, requirement: { section, title, level, text: sentence, anchor, element: block } });
	}
	return found;
}

/* ---------------------------------------------------------------- WCAG */

function readWcag(): Requirement[] {
	const items: { base: string; requirement: Omit<Requirement, 'id'> }[] = [];
	document.querySelectorAll('p.conformance-level').forEach((levelNode) => {
		const level = /Level\s+(A{1,3})\b/.exec(levelNode.textContent ?? '')?.[1];
		const criterion = levelNode.closest('section');
		if (!level || !criterion) return;
		const heading = headingOf(criterion);
		const number = /(\d+(?:\.\d+)+)/.exec(heading?.querySelector('.secno')?.textContent ?? '')?.[1] ?? '';
		if (!number) return;
		const guideline = criterion.parentElement?.closest('section');
		const guidelineHeading = numberAndName(guideline ? headingOf(guideline) : null);
		const guidelineNumber = /(\d+(?:\.\d+)*)/.exec(guidelineHeading.number)?.[1] ?? '';
		const parts: string[] = [];
		for (const child of Array.from(criterion.children)) {
			if (child === levelNode || !/^(P|DL|UL|OL)$/.test(child.tagName)) continue;
			if (child.matches('.note, .example, .doclinks, .conformance-level')) continue;
			parts.push(plainText(child, '.note, .example'));
		}
		items.push({
			base: number,
			requirement: {
				section: [guidelineNumber, guidelineHeading.name].filter(Boolean).join(' '),
				title: numberAndName(heading).name,
				level,
				text: parts.filter(Boolean).join(' '),
				anchor: criterion.id,
				element: criterion,
			},
		});
	});
	return finalizeIds(items);
}

/* ---------------------------------------------------------------- W3C */

/** Parts of a W3C document that are not normative, or are not part of the text. */
const NON_NORMATIVE = 'pre, nav, #toc, .note, .example, .informative, aside, .issue, .advisement, .note-title, .header-wrapper, .doclinks';

/** The heading a block sits under: its section's own heading, or, in flat documents, the closest heading before it. */
function headingFor(block: Element, headings: Element[]): { number: string; name: string } {
	const section = block.closest('section');
	const own = section ? headingOf(section) : null;
	if (own) return numberAndName(own);
	let found: Element | null = null;
	for (const heading of headings) {
		if (heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) found = heading;
		else break;
	}
	return numberAndName(found);
}

function readW3c(): Requirement[] {
	const blocks = new Map<Element, string>();
	const marked = document.querySelectorAll('.rfc2119');
	if (marked.length > 0) {
		marked.forEach((keyword) => {
			const block = keyword.closest('p, li, dd, dt, td, blockquote, div');
			if (block && !block.closest(NON_NORMATIVE)) blocks.set(block, keyword.textContent ?? '');
		});
	} else {
		// Many specifications no longer mark the keywords up. Read the uppercase ones from the text.
		document.querySelectorAll('p, dd, dt, td, blockquote, li:not(:has(p))').forEach((block) => {
			if (!block.closest(NON_NORMATIVE) && bcp14Level(block.textContent ?? '') !== null) blocks.set(block, '');
		});
	}
	const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter((heading) => !heading.closest(NON_NORMATIVE));
	const items: { base: string; requirement: Omit<Requirement, 'id'> }[] = [];
	let loose = 0;
	for (const [block, keywordText] of blocks) {
		const heading = headingFor(block, headings);
		const base = heading.number || `R${(loose += 1)}`;
		const text = plainText(block, '.self-link, .permalink');
		const anchor = nearestId(block);
		const sentences = sentenceRequirements(block, text, base, heading.number, heading.name, anchor);
		if (sentences.length > 0) {
			items.push(...sentences);
			continue;
		}
		// A keyword written in lower case inside the markup: use the markup's own word.
		const level = bcp14Level(keywordText.toUpperCase());
		if (level && !isBoilerplate(text)) items.push({ base, requirement: { section: heading.number, title: heading.name, level, text, anchor, element: block } });
	}
	return finalizeIds(items);
}

/* ---------------------------------------------------------------- RFC */

function readRfc(): Requirement[] {
	const candidates = Array.from(document.querySelectorAll('p[id], li[id], dd[id], dt[id], td[id], blockquote[id]')).filter(
		(element) => /^(section|appendix)-/.test(element.id) && !element.closest('pre, #toc, nav, .references'),
	);
	const candidateSet = new Set(candidates);
	const items: { base: string; requirement: Omit<Requirement, 'id'> }[] = [];
	for (const element of candidates) {
		// Text of the element itself, without the candidates nested inside it (a list item holding paragraphs).
		const copy = element.cloneNode(true) as Element;
		const nested = Array.from(element.querySelectorAll('[id]')).filter((inner) => candidateSet.has(inner));
		if (nested.length > 0) {
			const paths = new Set(nested.map((inner) => inner.id));
			copy.querySelectorAll('[id]').forEach((inner) => {
				if (paths.has(inner.id)) inner.remove();
			});
		}
		copy.querySelectorAll('.pilcrow, .selfRef, pre').forEach((node) => node.remove());
		const text = squash(copy.textContent ?? '');
		if (!text || bcp14Level(text) === null) continue;

		const section = element.closest('section[id^="section-"], section[id^="appendix-"]');
		const heading = numberAndName(section ? headingOf(section) : null);
		const base = element.id.replace(/^(section|appendix)-/, '');
		items.push(...sentenceRequirements(element, text, base, heading.number, heading.name, element.id));
	}
	return finalizeIds(items);
}

/* ---------------------------------------------------------------- EUR-Lex */

function articleNumber(label: string): string {
	return /(\d+[A-Za-z]*)/.exec(label)?.[1] ?? '';
}

function readEurLex(): Requirement[] {
	const items: { base: string; requirement: Omit<Requirement, 'id'> }[] = [];
	document.querySelectorAll('div.eli-subdivision[id^="art_"]').forEach((article) => {
		const label = squash(article.querySelector('.oj-ti-art')?.textContent ?? '');
		const number = articleNumber(label) || article.id.replace(/^art_/, '');
		const title = squash(article.querySelector('.oj-sti-art')?.textContent ?? '');

		// Numbered paragraphs sit in `div[id="005.001"]`. Articles without them keep their paragraphs as direct `p` children.
		let units: { element: Element; paragraph: string; anchor: string }[] = Array.from(article.querySelectorAll(':scope > div[id]'))
			.filter((div) => /^\d+\.\d+$/.test(div.id))
			.map((div) => ({ element: div, paragraph: String(Number(div.id.split('.')[1])).replace(/^0$/, ''), anchor: div.id }));
		if (units.length === 0) {
			const paragraphs = Array.from(article.querySelectorAll(':scope > p.oj-normal'));
			units = paragraphs.map((p, index) => {
				const lead = /^\s*(\d+)\./.exec(p.textContent ?? '')?.[1];
				return { element: p, paragraph: lead ?? (paragraphs.length > 1 ? String(index + 1) : ''), anchor: p.id || article.id };
			});
		}

		for (const unit of units) {
			const text = Array.from(unit.element.querySelectorAll('p'))
				.map((p) => squash(p.textContent ?? ''))
				.filter(Boolean)
				.join(' ') || squash(unit.element.textContent ?? '');
			const level = SHALL.test(text) ? 'Shall' : MUST.test(text) ? 'Must' : '';
			if (!level) continue;
			items.push({
				base: unit.paragraph ? `Art. ${number}(${unit.paragraph})` : `Art. ${number}`,
				requirement: { section: label || `Article ${number}`, title, level, text, anchor: unit.anchor, element: unit.element },
			});
		}
	});
	return finalizeIds(items);
}

/* ---------------------------------------------------------------- entry */

/** Picks the reader for the current page, or returns null when the page is not a supported kind of document. */
export function readSpec(): SpecDocument | null {
	const host = window.location.hostname;
	const bareTitle = squash(document.title);

	if (/(^|\.)w3\.org$/.test(host)) {
		const wcag = document.querySelector('p.conformance-level') !== null;
		const requirements = wcag ? readWcag() : readW3c();
		return {
			source: wcag ? 'wcag' : 'w3c',
			kind: wcag ? 'WCAG success criteria' : 'W3C Technical Report',
			title: bareTitle,
			levels: wcag ? ['A', 'AA', 'AAA'] : BCP14_LEVELS,
			requirements,
		};
	}
	if (/(^|\.)rfc-editor\.org$/.test(host)) {
		return { source: 'rfc', kind: 'IETF RFC', title: bareTitle, levels: BCP14_LEVELS, requirements: readRfc() };
	}
	if (/(^|\.)europa\.eu$/.test(host)) {
		return {
			source: 'eurlex',
			kind: 'EUR-Lex legal text',
			title: bareTitle.replace(/\s*-\s*EUR-Lex\s*$/i, ''),
			levels: ['Shall', 'Must'],
			requirements: readEurLex(),
		};
	}
	return null;
}
