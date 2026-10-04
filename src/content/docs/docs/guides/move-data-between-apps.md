---
title: Move data between apps
description: Copy structured data in one web app and paste it into another with window.agentlet.records.
---

`window.agentlet.records` copies structured data from one web page and pastes it into another web app, field by field, with a preview before anything is filled. It needs agentlet-core 2.3.0 or later.

A record travels through the system clipboard. There is no backend and no shared storage between the two sites.

If the target has no agentlet, the paste still works as a normal paste. A spreadsheet gets a table. A mail or a document gets readable text. You only lose the field mapping.

## How it works

### The record envelope

A record is a small versioned JSON object: a type, flat typed fields, optional labels and where it came from.

```json
{
  "agentlet": "record",
  "version": 1,
  "type": "organization",
  "fields": {
    "organization": "Example SAS",
    "siren": "123456789",
    "street-address": "1 rue Exemple",
    "postal-code": "75001",
    "address-level2": "Paris",
    "country-name": "France"
  },
  "labels": {
    "siren": "SIREN"
  },
  "source": {
    "url": "https://annuaire-entreprises.data.gouv.fr/entreprise/123456789",
    "origin": "https://annuaire-entreprises.data.gouv.fr",
    "title": "Example SAS",
    "copiedAt": "2026-10-01T09:30:00.000Z"
  }
}
```

- `fields` is flat. Each value is a string, a number, a boolean or `null`. Nested data is not part of version 1.
- A table is a `table` record with `columns` and `rows` instead of `fields`.
- `source` is set by the API from the current page, never by the caller.
- A list of records of the same type is written as one clipboard item.
- The serialized record is limited to 1 MB.
- Readers ignore unknown top-level keys and reject an unknown major version.

### The clipboard formats

`copy()` writes one clipboard item with up to three formats.

| Format | Content | Read by |
|---|---|---|
| `web application/vnd.agentlet.record+json` | The envelope. | Agentlet targets, on Chromium only. |
| `text/html` | A `<table>` for tables and lists, a `<dl>` for one record. The root element carries `data-agentlet-record` with the base64url-encoded envelope. | Spreadsheets, rich text editors, and agentlet targets on every engine. |
| `text/plain` | Tab-separated values for tables and lists, `Label: value` lines for one record. | Everything else. |

The custom format is an extra, not a dependency. Firefox rejects it on write, and the `paste` event never gives usable data for it. The HTML embedding is the transport that works on every engine, so the target reads the record from there. If a program in between removes the attribute when it re-serializes the HTML, the target sees a table or text and no record.

On the target, the order is: the custom format, then the HTML embedding, then nothing. The API never guesses a record from plain text.

### The copy order

`copy()` starts two writes in the same synchronous run, inside the click or key press that triggered it:

1. A `copy` event writes `text/html` and `text/plain`. It needs no clipboard permission, only a user gesture.
2. `navigator.clipboard.write()` then writes the custom format, `text/html` and `text/plain`, as an enhancement. It retries without the custom format if the browser rejects it, as Firefox does.

The copy event goes first because of WebKit. `document.execCommand('copy')` needs a live user gesture, and WebKit loses that gesture after any asynchronous clipboard call, even a rejected one. Running the copy event before any `await` works on Chromium, Firefox and WebKit. It also covers hosts that refuse the clipboard API: webviews, iframes without the `clipboard-write` permissions policy and locked-down browsers.

The result tells you what happened. `method` is `'clipboard-api'` or `'copy-event'`, `customFormat` says whether the custom format was written, and `formats` lists the clipboard types.

Call `copy()` straight from a click or key handler, with no `await` before it. It rejects only if both paths fail, with an error that starts with `Copying was blocked by the browser`.

### The paste paths

There are two ways to read a record on the target.

- The `paste` event. The user presses Ctrl+V or Cmd+V in the target form, and `onPaste()` hands you the records. There is no permission prompt.
- `pasteFromClipboard()`, from a button. It calls `navigator.clipboard.read()`, which needs a user gesture and, in Chromium, a permission prompt. Use it for pages that block paste events.

## Source side

Build a record, then copy it.

| Method | Builds |
|---|---|
| `create(type, fields)` | A record from values you already have. |
| `fromForm(element)` | A `fields` record from a form, through `forms.quickExport()`. |
| `fromTable(table)` | A `table` record, through `tables.extract()`. |
| `fromElement(element)` | A table gives a table record. A form, a `dl` or label and value pairs give a fields record. `null` when nothing fits. |
| `pick()` | The user clicks an element, then `fromElement()` runs. Resolves `null` on Escape. |

```javascript
const records = window.agentlet.records;

const record = records.create('organization', {
    organization: document.querySelector('h1').textContent.trim(),
    siren: document.querySelector('[data-siren]').dataset.siren,
});

button.addEventListener('click', async () => {
    const result = await records.copy(record);
    window.agentlet.utils.MessageBubble.success(`Copied (${result.method})`);
});
```

`fromForm()`, `fromElement()` and `pick()` accept `type` (default `'fields'`), `includeEmpty` and `redact`. `pick()` also accepts `message` and `selector`, to limit what can be picked.

## Target side

Listen for pastes inside the target form, then fill it.

```javascript
const records = window.agentlet.records;
const form = document.querySelector('form#supplier');

const stop = records.onPaste(async ([record]) => {
    const result = await records.fill(record, form);
    if (result.confirmed) {
        window.agentlet.utils.MessageBubble.success(`${result.successful} fields filled`);
    }
}, { scope: form, types: ['organization'] });

// Later: stop();
```

### onPaste

`onPaste(handler, { scope, types })` returns an unsubscribe function.

- `scope` is required. It is the element to listen in, usually the target form. Without a valid element, `onPaste()` throws a `TypeError`. There is no document-wide default that could take over a paste into a comment box or a search field.
- `types` limits the handler to those record types.
- A paste without a record is never intercepted, and `preventDefault()` is never called on it, including inside text inputs. `preventDefault()` is only called on a paste inside the scope that carries a record the handler receives.

### match

`match(record, target)` computes the mapping and fills nothing. It returns the entries (record key, target selector, confidence and reason), the record keys with no target field (`unmatchedKeys`) and the target fields with no record field (`unmatchedFields`). Selectors are computed on the target page. They never come from the record.

Use it to show your own preview, then call `forms.fill()` yourself.

### fill and the preview

`fill(record, target)` matches, shows a preview dialog, then fills through `forms.fill()`. It never submits the form.

The preview shows:

- the source: origin, page title and how long ago it was copied;
- one row per record field, with its value, the target field it maps to (a select you can change) and the confidence;
- the record fields with no target, listed separately;
- Fill and Cancel buttons.

Options:

- `preview` (default `true`): pass `false` to fill without a dialog.
- `minConfidence` (default `0.6`): below it, the field is left for the user in the preview, and skipped when `preview` is `false`.
- `remember` (default `true`): read and write the mapping memory.
- `fill`: options forwarded to `forms.fill()`.

The result extends the `forms.fill()` result with `mapping` and `confirmed`. `confirmed` is `false` if the user cancelled the preview.

### Mapping memory

When the user corrects a mapping in the preview, the correction is saved with `storage.local` on the target origin. It is keyed by record type and a form signature (the form `action` path and the sorted list of field names). The next paste of the same type into the same form uses the remembered mapping. Nothing leaves the target origin.

### pasteFromClipboard

For pages that block paste events, put a button in your panel:

```javascript
pasteButton.addEventListener('click', async () => {
    const result = await records.pasteFromClipboard(form, { types: ['organization'] });
    if (!result) {
        window.agentlet.utils.MessageBubble.info('No record on the clipboard');
    }
});
```

`pasteFromClipboard(target, options)` calls `read()`, takes the first record whose type is allowed, then calls `fill()`. It resolves `null` when the clipboard holds no matching record. It accepts the `fill()` options and `types`.

## Record types

Every record has a type. The built-in types are generic:

| Type | Holds |
|---|---|
| `table` | `columns` and `rows`. |
| `fields` | Any set of key and value pairs. The default. |
| `contact` | `name`, `given-name`, `family-name`, `email`, `tel`, `organization`, `organization-title`, `url`. |
| `address` | `street-address`, `address-line1`, `address-line2`, `postal-code`, `address-level2`, `address-level1`, `country-name`. |
| `organization` | `organization`, `url`, `email`, `tel`, `street-address`, `postal-code`, `address-level2`, `country-name`. |

### Keys use the autocomplete vocabulary

Field keys use the HTML `autocomplete` tokens whenever one fits: `name`, `given-name`, `email`, `tel`, `organization`, `street-address`, `postal-code`, `country-name`, `bday`, `url`. Many real forms already carry these tokens, which gives the matcher a strong first signal on the target. Other keys are lowercase and hyphenated, such as `siren` or `invoice-number`.

### Define your own type

Domain types belong to your agentlet, not to core.

```javascript
window.agentlet.records.defineType({
    name: 'invoice',
    label: 'Invoice',
    fields: [
        { key: 'invoice-number', label: 'Invoice number', required: true },
        { key: 'organization', label: 'Supplier' },
        { key: 'total', label: 'Total', kind: 'number' },
        { key: 'currency', label: 'Currency' },
        {
            key: 'issue-date',
            label: 'Issue date',
            kind: 'date',
            synonyms: ['date de facture', 'invoice date'],
        },
    ],
});
```

- `kind` is one of `text` (default), `number`, `date`, `boolean`, `email`, `tel` or `url`. It is used for validation and conversion on fill. A `date` is written into an `input[type=date]` as `YYYY-MM-DD`.
- `synonyms` are extra label texts the matcher accepts for the key.
- A type name uses lowercase letters, digits and hyphens. A built-in type cannot be redefined.
- `getType(name)` and `listTypes()` read the registry.

The built-in keys come with English and French synonyms, so a `fields` record with an `email` key still matches a field labelled "Courriel".

## Matching

`match()` scores each target field against each record key, then assigns greedily from the highest score. The signals, strongest first:

| Order | Signal | Confidence |
|---|---|---|
| 1 | Remembered mapping for this record type and form. | 1 |
| 2 | The `autocomplete` attribute of the target equals the key. | 0.95 |
| 3 | The `name` or `id` equals the key after normalization (lowercase, separators removed, camelCase split). | 0.85 |
| 4 | The label (from `forms.quickExport()`, then `aria-label`, then `placeholder`) matches the key, its label or a synonym, ignoring case and accents. | 0.75 |
| 5 | The input type is compatible (`email`, `tel`, `url`, `date`, `number`). | Tie breaker and veto. |

The type veto means a value a field cannot take never goes into it. A `number` value does not go into an `input[type=email]`.

Select elements match on the option value first, then on the option text. Checkboxes take booleans and the strings `yes`, `true`, `1` and `oui`.

Not matched in this version:

- radio groups on the target are skipped;
- a `table` record cannot be matched to or filled into a form. `match()` and `fill()` throw an `Error` for it, so use a fields record.

## Safety

- **Sensitive fields are never copied or filled.** This covers `input[type=password]` and the `autocomplete` tokens `current-password`, `new-password`, `one-time-code` and every `cc-*` token, on both the source and the target side.
- **`redact` drops more keys.** Pass `redact: ['siren']` to `copy()` or `fromForm()` to keep a key out of the record.
- **A record is data only.** It never carries selectors and nothing in it is evaluated. Target selectors are computed on the target page from the target DOM.
- **The source is only as stated by the copying page.** On a pasted record, `source` is what the copying page claimed. Anyone can write any value there, so it can be spoofed. It is a hint shown to the user, not proof of origin.
- **The clipboard is readable by other applications.** Never copy secrets.
- **Events carry no values.** `records:copied`, `records:pasted` and `records:filled` on `window.agentlet.eventBus` carry the record type, counts and the source origin, never field values.

## Browser support

The RFC measured clipboard behavior with Playwright 1.54.1 builds (Chromium, Firefox and WebKit, headless, macOS) on 2026-10-01. A real keyboard paste lands in a page listening to `paste`, and the page also calls `navigator.clipboard.read()` on a click.

| Engine | Custom format | HTML embedding on `paste` | HTML embedding on `read()` |
|---|---|---|---|
| Chromium | Written. Readable through `read()` only. | Works. | Works. |
| Firefox | Rejected on write. `copy()` retries without it. | Works. | Works. |
| WebKit | Written, but `getData()` returns an empty string on the `paste` event. | Works. | Not verified. Permission is denied in headless WebKit. |

Read this as follows:

- The HTML embedding works on Chromium, Firefox and WebKit. Smart paste through the `paste` event works on all three.
- The custom format is only readable through `read()`, so in practice it is a Chromium extra.
- `pasteFromClipboard()` and `read()` on WebKit were not verified. Treat them as untested until they are run in a headed Safari.
- Other applications may strip `data-agentlet-record`. They still get the table, the list and the plain text. This was not tested.

## Limits

- The clipboard holds one item. A list of records is one item, and all records in it must have the same type.
- A record is limited to 1 MB serialized. `copy()` throws above that.
- If a clipboard permission prompt is never answered, `copy()` keeps waiting. The copy event content is already on the clipboard, so the copy itself worked.
- The copy fallback briefly selects an off-screen element. If the focus was in an input, it moves out for an instant and comes back, which fires `blur` and `focus` on it. The previous selection and focus are restored.
- A successful `copy()` fires a `copy` event on the document in every browser, so page-level `copy` listeners run. The agentlet listener does not stop propagation.

## Errors

`fromForm()`, `fromTable()`, `fromElement()`, `match()`, `fill()` and `pasteFromClipboard()` throw a `TypeError` that names the method, for example `records.fromElement() expects an Element`, when they get the wrong kind of argument. `onPaste()` throws a `TypeError` when `scope` is missing. See the [public API reference](/docs/reference/public-api/#windowagentletrecords) for every method.

## Try it and read more

- [Try it on real sites](/try/known-sites/): agentlet running on real pages.
- The example page [`records-copy-paste.html`](https://github.com/agentlet/agentlet-core/blob/main/examples/data-processing/records-copy-paste.html) in agentlet-core.
- The design, the browser spike and the decisions: [RFC 0001](https://github.com/agentlet/agentlet-core/blob/main/docs/rfcs/0001-records-api.md).
- Related guides: [form filling](/docs/guides/forms-filling/) and [tables and Excel](/docs/guides/tables-and-excel/).
