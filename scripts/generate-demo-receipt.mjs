#!/usr/bin/env node
/**
 * Generates the fictitious receipt used by the home page sandbox and by the
 * expense-receipt agentlet (src/agentlets/expense-receipt.ts): a PDF anyone
 * can open, and a fixed-size PNG preview of it committed alongside.
 *
 * Reproducible on purpose: every value on the receipt is a literal below,
 * not random, so re-running this script always produces the same numbers.
 * The agentlet's recorded AI response must stay in sync with VENDOR/ADDRESS/
 * DATE/CURRENCY/subtotal/vat/total by hand; there is no shared runtime
 * import between a Node build script and a browser bundle, so the values
 * are duplicated deliberately (see the comment in expense-receipt.ts).
 *
 * Rendering approach: builds one HTML document (inline CSS, no network
 * requests, no web fonts) and uses the Chromium already installed for
 * Playwright's own e2e tests (see playwright.config.ts) to both print it to
 * a PDF and screenshot it to a PNG, so the two outputs always show exactly
 * the same content. No new dependency: @playwright/test already re-exports
 * the `chromium` launcher.
 *
 * Usage: node scripts/generate-demo-receipt.mjs
 * Output:
 *   public/demo/receipt.pdf
 *   public/demo/receipt-preview.png
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'public/demo');

// Fictitious vendor. No real business, address, or VAT number.
const VENDOR = 'Riverside Bistro';
const ADDRESS_LINES = ['14 Anchor Street', 'Bristol BS1 4ST, United Kingdom'];
const VAT_NUMBER = 'GB123456789';
const RECEIPT_NUMBER = '004821';
/** ISO date, also the exact value the demo agentlet's recorded response fills into the form's date field. */
const DATE_ISO = '2026-03-14';
const DATE_DISPLAY = '14 Mar 2026';
const CURRENCY_SYMBOL = 'GBP';
const CATEGORY_HINT = 'Meals and entertainment';

const LINE_ITEMS = [
	{ qty: 2, description: "Chef's lunch menu", unitPrice: 18.0 },
	{ qty: 1, description: 'House red wine, bottle', unitPrice: 24.0 },
	{ qty: 2, description: 'Espresso', unitPrice: 3.0 },
];

const VAT_RATE = 0.2;

/** @param {number} value */
function money(value) {
	return value.toFixed(2);
}

const subtotal = LINE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
const vatAmount = subtotal * VAT_RATE;
const total = subtotal + vatAmount;

// Page size in CSS pixels. Deliberately small and tall, like a printed
// receipt, and reused as-is for both the PDF page size and the PNG preview
// dimensions, so the preview never shows anything the PDF does not.
const PAGE_WIDTH = 360;
const PAGE_HEIGHT = 470;

function lineItemRow(item) {
	const lineTotal = item.qty * item.unitPrice;
	return `
		<div class="row">
			<span>${item.qty} x ${item.description}</span>
			<span>${money(lineTotal)}</span>
		</div>
	`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
	* { box-sizing: border-box; }
	html, body {
		margin: 0;
		padding: 0;
		width: ${PAGE_WIDTH}px;
		height: ${PAGE_HEIGHT}px;
		background: #ffffff;
		color: #1a1a1a;
		font-family: 'Courier New', Courier, monospace;
		font-size: 13px;
		line-height: 1.5;
	}
	.receipt {
		padding: 22px 20px;
	}
	.center {
		text-align: center;
	}
	.vendor {
		font-size: 17px;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.muted {
		color: #4a4a4a;
	}
	.divider {
		border: none;
		border-top: 1px dashed #8a8a8a;
		margin: 12px 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.row.total {
		font-weight: bold;
		font-size: 14px;
	}
	.meta {
		margin-top: 10px;
	}
	.footer {
		margin-top: 16px;
	}
</style>
</head>
<body>
	<div class="receipt">
		<div class="center">
			<div class="vendor">${VENDOR}</div>
			<div class="muted">${ADDRESS_LINES.join('<br />')}</div>
			<div class="muted">VAT No. ${VAT_NUMBER}</div>
		</div>

		<hr class="divider" />

		<div class="meta">
			<div class="row"><span>Receipt No.</span><span>${RECEIPT_NUMBER}</span></div>
			<div class="row"><span>Date</span><span>${DATE_DISPLAY}</span></div>
		</div>

		<hr class="divider" />

		${LINE_ITEMS.map(lineItemRow).join('')}

		<hr class="divider" />

		<div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
		<div class="row"><span>VAT (${Math.round(VAT_RATE * 100)}%)</span><span>${money(vatAmount)}</span></div>
		<div class="row total"><span>Total (${CURRENCY_SYMBOL})</span><span>${money(total)}</span></div>

		<hr class="divider" />

		<div class="footer muted">
			<div>Category: ${CATEGORY_HINT}</div>
			<div class="center" style="margin-top: 14px;">Thank you for dining with us.</div>
		</div>
	</div>
</body>
</html>
`;

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({
			viewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
			deviceScaleFactor: 2,
			colorScheme: 'light',
		});
		await page.setContent(html, { waitUntil: 'load' });
		await page.emulateMedia({ media: 'screen' });

		const pdfBuffer = await page.pdf({
			width: `${PAGE_WIDTH}px`,
			height: `${PAGE_HEIGHT}px`,
			printBackground: true,
			margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
		});
		writeFileSync(join(OUT_DIR, 'receipt.pdf'), pdfBuffer);

		const pngBuffer = await page.screenshot({ type: 'png' });
		writeFileSync(join(OUT_DIR, 'receipt-preview.png'), pngBuffer);
	} finally {
		await browser.close();
	}

	console.log(
		`Generated public/demo/receipt.pdf and public/demo/receipt-preview.png (${PAGE_WIDTH}x${PAGE_HEIGHT}, dated ${DATE_ISO}, subtotal ${money(subtotal)}, VAT ${money(vatAmount)}, total ${money(total)} ${CURRENCY_SYMBOL}).`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
