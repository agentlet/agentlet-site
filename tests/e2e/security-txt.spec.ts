import { expect, test } from '@playwright/test';

test('serves security.txt with a working contact', async ({ request }) => {
	const response = await request.get('/.well-known/security.txt');
	expect(response.status()).toBe(200);
	const body = await response.text();
	expect(body).toContain('Contact: https://github.com/agentlet/agentlet-core/security/advisories/new');
	expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
});
