---
title: AI-ready forms
description: Export clean, AI-friendly form data with quickExport and exportForAI.
---

Alongside the full [form extraction](/docs/guides/forms-extraction/) result, `window.agentlet.forms` exposes two functions that return clean, structured data with a single best selector per field, intended for AI-powered form filling.

## `quickExport(element)`

The simplest shape: a flat array of fields.

```javascript
const fields = window.agentlet.forms.quickExport(document.getElementById('my-form'));
```

```javascript
[
    {
        selector: '#firstName',
        type: 'text',
        name: 'firstName',
        label: 'First name',
        value: 'John',
        required: true,
        options: null,
    },
    {
        selector: '#country',
        type: 'select',
        name: 'country',
        label: 'Country',
        value: { selectedValue: 'us', selectedOptions: [{ value: 'us', text: 'United States' }] },
        required: true,
        options: [
            { value: 'us', text: 'United States', selected: true, disabled: false },
            { value: 'ca', text: 'Canada', selected: false, disabled: false },
        ],
    },
]
```

`quickExport` is `exportForAI` with the hidden, disabled, and bounding-box options fixed to `false`.

## `exportForAI(element, options)`

A structured object grouped by form, useful for more advanced processing.

```javascript
const formData = window.agentlet.forms.exportForAI(document.body, {
    includeHidden: false,
    includeDisabled: false,
    includeReadOnly: true,
});
```

```javascript
{
    metadata: {
        url: 'https://example.com/register',
        title: 'Registration page',
        extractedAt: '2024-01-15T10:30:00.000Z',
        totalForms: 1,
        totalElements: 8,
    },
    forms: [
        {
            id: 'registration-form',
            name: 'register',
            action: '/register',
            method: 'post',
            selector: '#registration-form',
            elements: [
                {
                    type: 'text',
                    id: 'firstName',
                    name: 'firstName',
                    selector: '#firstName',
                    label: 'First name',
                    placeholder: 'Enter your first name',
                    value: 'John',
                    required: true,
                    disabled: false,
                    visible: true,
                    interactable: true,
                },
            ],
        },
    ],
    standaloneElements: [], // Elements not inside a <form> tag
}
```

Only elements where `interactable === true` are included in a form's `elements` array. Each element's `options` field, when present, follows the same select or radio and checkbox group shape as [select options](/docs/guides/forms-select-options/).

## `extract(element, options)`

The full extraction, with every element (interactable or not) and the raw `FormElementInfo` shape. See [Form extraction](/docs/guides/forms-extraction/) for the complete structure.

```javascript
const fullData = window.agentlet.forms.extract(element, options);
```

## Usage examples

### Basic AI form filling

```javascript
function fillFormWithAI(formElement, userData) {
    const fields = window.agentlet.forms.quickExport(formElement);

    for (const field of fields) {
        const value = userData[field.name];
        if (value === undefined) continue;

        const element = document.querySelector(field.selector);
        if (!element) continue;

        if (field.type === 'checkbox') {
            element.checked = Boolean(value);
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            element.value = value;
            element.dispatchEvent(new Event(field.type === 'select' ? 'change' : 'input', { bubbles: true }));
        }
    }
}
```

In practice, prefer [`fillFromAI`](/docs/guides/forms-filling/#fillfromaiparentelement-aiformdata-uservalues-options), which already handles this dispatch logic and reports success and failure per field.

### Analyze form complexity

```javascript
function analyzeFormForAI(element) {
    const formData = window.agentlet.forms.exportForAI(element);
    const analysis = { requiredFields: [], optionalFields: [], selectFields: [] };

    formData.forms.forEach((form) => {
        form.elements.forEach((field) => {
            (field.required ? analysis.requiredFields : analysis.optionalFields).push(field.name);
            if (field.type === 'select' && field.options) {
                analysis.selectFields.push({ name: field.name, options: field.options });
            }
        });
    });

    return analysis;
}
```

### Send to an AI service

```javascript
async function sendToAIService(formElement) {
    const formData = window.agentlet.forms.exportForAI(formElement);

    const response = await fetch('/ai/fill-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formStructure: formData }),
    });

    const filledValues = await response.json();
    window.agentlet.forms.fillFromAI(formElement, formData, filledValues.values);
}
```

Source: agentlet-core docs/ai-ready-forms-api.md and src/types/public-api.d.ts at e3f78fa. The source document described extra fields (`certainty` confidence scores, `selectorType`, `includeContext`, `groupByForm`, per-field `constraints`/`position`) that are not part of the current `AIFormExport`/`CleanFormElement`/`QuickExportField` types, so they were not carried over.
