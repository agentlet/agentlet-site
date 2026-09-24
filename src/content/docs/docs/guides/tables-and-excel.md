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

Options (`includeHeaderRow`, `trimWhitespace`) are accepted; extra keys are forwarded as-is.

## Extract with pagination

```javascript
const allData = await window.agentlet.tables.extractAll(tableElement, {
    nextButtonSelector: '.next-page-btn', // Required to enable pagination
    maxPages: 10,
    delay: 300, // Milliseconds to wait after clicking "next"
});
```

Without `nextButtonSelector`, `extractAll` behaves like a single-page `extract` and `metadata.totalPages` stays `1`.

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

Excel export depends on the SheetJS library being loadable at runtime:

```javascript
if (window.agentlet.tables.extractor.isExcelExportAvailable()) {
    // Safe to call download() / extractAndDownload()
}
```

## Direct access to the extractor

`window.agentlet.tables.extractor` is the underlying `TableExtractor` instance, with the same methods under their original names: `extractTableData`, `extractAllPages`, `downloadAsExcel`, `extractAndDownload`.

Source: agentlet-core CLAUDE.md, API Quick Reference ("Table extraction and Excel export"), and src/types/public-api.d.ts at e3f78fa.
