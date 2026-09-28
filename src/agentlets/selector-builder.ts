/**
 * Builds a robust CSS selector for a picked DOM element.
 *
 * Pulled out of selector-workshop.ts into its own module because it is a
 * pure function worth testing on its own (see tests/e2e/selector-builder.spec.ts,
 * which bundles this file with esbuild and exercises it against real DOM
 * structures in a browser page, no site build required).
 *
 * agentlet-core's own ElementSelector.generateCSSSelector() (see
 * ElementInfo.cssSelector, node_modules/agentlet-core/dist/agentlet-core.d.ts)
 * always walks up to 5 ancestors and joins their tag/class combination with
 * a child combinator, regardless of whether a shorter selector would
 * already be unique.
 * That is a reasonable default for a generic debug readout, but not what
 * this demo asks for: a selector a developer would actually want to keep,
 * preferring an id, then a stable attribute, then the shortest class and
 * nth-of-type path that still resolves to exactly one element.
 *
 * Priority order:
 * 1. `#id`, if the element has one and it is unique on the page (an id is
 *    supposed to be unique, but duplicate ids do happen in the wild).
 * 2. A stable attribute: `data-*` (in attribute order), then `name`, then
 *    `aria-label`, each qualified with the tag name, first one that is
 *    unique on the page.
 * 3. A path built from the element upward, one segment per ancestor
 *    (tag plus up to 3 non-"agentlet-" classes), adding `:nth-of-type(n)`
 *    to a segment only when the element has a sibling with the same tag
 *    and class combination. Stops as soon as the accumulated path is
 *    unique on the page, so a shorter selector is always preferred over a
 *    longer one; only reaches all the way to `<html>` when nothing shorter
 *    resolves to a single element.
 */

/** Counts document matches for `selector`; -1 for a syntactically invalid selector rather than throwing. */
function countMatches(doc: Document, selector: string): number {
	try {
		return doc.querySelectorAll(selector).length;
	} catch {
		return -1;
	}
}

/** Escapes a value for use inside a double-quoted CSS attribute selector, e.g. `[name="value"]`. */
function escapeAttributeValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function idSelector(element: Element): string | null {
	if (!element.id) return null;
	return `#${CSS.escape(element.id)}`;
}

/** `data-*` attributes (in DOM attribute order), then `name`, then `aria-label`; first one unique on the page wins. */
function stableAttributeSelector(element: Element, doc: Document): string | null {
	const tag = element.localName;
	const candidates: string[] = [];

	for (const attribute of Array.from(element.attributes)) {
		if (attribute.name.startsWith('data-') && attribute.value.trim() !== '') {
			candidates.push(`${tag}[${attribute.name}="${escapeAttributeValue(attribute.value)}"]`);
		}
	}

	const name = element.getAttribute('name');
	if (name && name.trim() !== '') {
		candidates.push(`${tag}[name="${escapeAttributeValue(name)}"]`);
	}

	const ariaLabel = element.getAttribute('aria-label');
	if (ariaLabel && ariaLabel.trim() !== '') {
		candidates.push(`${tag}[aria-label="${escapeAttributeValue(ariaLabel)}"]`);
	}

	for (const candidate of candidates) {
		if (countMatches(doc, candidate) === 1) return candidate;
	}
	return null;
}

/** Up to 3 classes, skipping empty entries and the "agentlet-" prefix reserved for this demo's own UI. */
function stableClasses(element: Element): string[] {
	return Array.from(element.classList)
		.filter((cls) => cls && !cls.startsWith('agentlet-'))
		.slice(0, 3)
		.map((cls) => CSS.escape(cls));
}

/** 1-indexed position of `element` among its same-tag siblings, the same counting rule CSS `:nth-of-type` uses. */
function nthOfTypeIndex(element: Element): number {
	let index = 1;
	let sibling = element.previousElementSibling;
	while (sibling) {
		if (sibling.tagName === element.tagName) index++;
		sibling = sibling.previousElementSibling;
	}
	return index;
}

/**
 * `#id` when the element has one (a strong stabilizer for an ancestor
 * segment, even though the id-uniqueness check already happened, and
 * failed, for the original leaf element in buildRobustSelector() itself:
 * without this, an ancestor's id would be ignored and the path would climb
 * needlessly far past a perfectly good anchor). Otherwise `tag` or
 * `tag.class1.class2`, with `:nth-of-type(n)` appended only when a sibling
 * shares the exact same tag and class combination (so the plain form is
 * ambiguous on its own).
 */
function segmentFor(element: Element): string {
	if (element.id) return `#${CSS.escape(element.id)}`;

	const tag = element.localName;
	const classes = stableClasses(element);
	const plain = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;

	const parent = element.parentElement;
	if (!parent) return plain;

	let matchingSiblings = 0;
	for (const child of Array.from(parent.children)) {
		if (child.tagName === element.tagName && child.matches(plain)) matchingSiblings++;
	}
	if (matchingSiblings <= 1) return plain;

	return `${plain}:nth-of-type(${nthOfTypeIndex(element)})`;
}

/** Builds the shortest tag/class/nth-of-type path, from the element upward, that is unique on the page. */
function pathSelector(element: Element, doc: Document): string {
	const segments: string[] = [];
	let node: Element | null = element;

	while (node) {
		segments.unshift(segmentFor(node));
		const candidate = segments.join(' > ');
		if (node.tagName === 'HTML' || countMatches(doc, candidate) === 1) {
			return candidate;
		}
		node = node.parentElement;
	}

	return segments.join(' > ');
}

/**
 * Builds a robust CSS selector for `element`: the shortest one, in the
 * priority order documented above, that resolves to exactly `element` on
 * `doc` (defaults to the current document).
 */
export function buildRobustSelector(element: Element, doc: Document = document): string {
	const id = idSelector(element);
	if (id && countMatches(doc, id) === 1) return id;

	const attributeSelector = stableAttributeSelector(element, doc);
	if (attributeSelector) return attributeSelector;

	return pathSelector(element, doc);
}
