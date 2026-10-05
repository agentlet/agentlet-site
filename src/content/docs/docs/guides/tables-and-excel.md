---
title: Tables and Excel
description: Extract HTML table data and export it to Excel.
---

`window.agentlet.tables` extracts data from an HTML `<table>` element, optionally follows pagination, and can export the result as an Excel file.

## Extract a single page

```javascript
const tableData = window.agentlet.tables.extract(tableElement);
```

```javascript
{
    headers: ['Name', 'Email', 'Role'],
    rows: [
        ['Jane Doe', 'jane@example.com', 'Admin'],
        ['John Smith', 'john@example.com', 'Member'],
    ],
    metadata: {
        totalRows: 2,
        totalColumns: 3,
        extractedAt: '2024-01-15T10:30:00.000Z',
        tableId: null,
    },
}
```

Options (`includeHeaderRow`, `trimWhitespace`, and the ones below) are accepted; extra keys are forwarded as-is.

## Read stacked cell content

By default a cell is read with `textContent`, so text from stacked elements is glued together: a cell showing "John Davis" above "CTO" reads `'John DavisCTO'`. Since agentlet-core 2.2.0, `cellText` picks another reading:

- **`'textContent'`** (default): the raw text, unchanged from earlier versions.
- **`'innerText'`**: the text as the browser renders it, following CSS (`display: block`, `<br>`, hidden elements). Where `innerText` is not implemented, it falls back to `'blocks'`.
- **`'blocks'`**: lines split on block-level tags (`div`, `p`, `li`, ...) and `<br>`, whatever the CSS.

In `'innerText'` and `'blocks'` modes, `cellSeparator` (default `' '`) joins the lines of a cell. Inline elements stay joined, so `$<span>12</span>` still reads `'$12'`.

```javascript
const tableData = window.agentlet.tables.extract(tableElement, {
    cellText: 'innerText',
    cellSeparator: ' | ', // 'John Davis | CTO'
});
```

## Skip columns

Since agentlet-core 2.2.0, `excludeColumns` drops columns that hold UI controls rather than data, such as an "Actions" or a selection column. Each item is a zero-based column index, a header text (case-insensitive, trimmed) or a `RegExp` tested against each header:

```javascript
const tableData = window.agentlet.tables.extract(tableElement, {
    excludeColumns: ['Actions', 0, /^select/i],
});
```

Header text and `RegExp` matches need the header row (`includeHeaderRow`, the default). The option applies to every page of `extractAll`.

## Extract with pagination

```javascript
const allData = await window.agentlet.tables.extractAll(tableElement, {
    nextButtonSelector: '.next-page-btn', // Required to enable pagination
    maxPages: 10,
    delay: 300, // Milliseconds to wait after clicking "next"
});
```

Without `nextButtonSelector`, `extractAll` behaves like a single-page `extract` and `metadata.totalPages` stays `1`.

A pagination control counts as disabled, which ends pagination, when it has the `disabled` property, the `disabled` class or, since agentlet-core 2.2.0, `aria-disabled="true"`.

### Start from the first page

`extractAll` starts from the page currently shown. Since agentlet-core 2.2.0, it can go back to page 1 first:

```javascript
const allData = await window.agentlet.tables.extractAll(tableElement, {
    nextButtonSelector: '.next-page-btn',
    firstPageSelector: '.first-page-btn', // Clicked once, unless disabled
});
```

When the pager has no "first page" control, pass `previousButtonSelector` instead: it is clicked until it is missing or disabled, waiting `delay` after each click. `firstPageSelector` wins when both are set.

## Download as Excel

```javascript
const result = await window.agentlet.tables.download(tableData, {
    filename: 'data.xlsx',
    sheetName: 'Export',
});
```

```javascript
// On success
{ success: true, filename: 'data.xlsx', rowCount: 2, columnCount: 3 }

// On failure
{ success: false, error: 'Excel export library is not available' }
```

## Extract and download in one step

```javascript
const result = await window.agentlet.tables.extractAndDownload(tableElement, {
    includePagination: true,
    nextButtonSelector: '.next-page-btn', // Required when includePagination is true
    filename: 'complete-data.xlsx',
});
```

## Checking availability

Excel export depends on the SheetJS library. In the next release SheetJS is not part of the core bundle: it is loaded the first time an export needs it (see [Install](/docs/getting-started/install/#size)). `isExcelExportAvailable()` is true when it is loaded or can be loaded:

```javascript
if (window.agentlet.tables.extractor.isExcelExportAvailable()) {
    // Safe to call download() / extractAndDownload()
}
```

`download()` and `extractAndDownload()` load SheetJS themselves. If the file cannot be loaded they resolve with `{ success: false, error }`, where `error` names the URL and the option to change (`libraryBaseUrl`).

## Load SheetJS ahead of time

To load SheetJS before the first export, for example so that `window.XLSX` exists or to call the synchronous `createExcelWorkbook()` on the extractor, either await `ensureXLSX()` or list `xlsx` in `preloadLibraries`:

```javascript
await window.agentlet.tables.extractor.ensureXLSX(); // resolves false when it cannot be loaded

// or, at startup
const core = new window.AgentletCore.default({ preloadLibraries: ['xlsx'] });
await core.init(); // window.XLSX is defined once this resolves
```

## Direct access to the extractor

`window.agentlet.tables.extractor` is the underlying `TableExtractor` instance, with the same methods under their original names: `extractTableData`, `extractAllPages`, `downloadAsExcel`, `extractAndDownload`.
