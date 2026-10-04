---
title: Form extraction
description: Analyze DOM elements to extract form structure and field metadata.
---

The `FormExtractor` utility analyzes a DOM element and reports the form elements found inside it, along with enough metadata (selector, label, value, options, state) to target and fill them programmatically.

## Basic usage

```javascript
// Through the forms namespace (recommended)
const formData = window.agentlet.forms.extract(element, options);

// Or through the extractor directly
const extractor = window.agentlet.forms.extractor;
const formData = extractor.extractFormStructure(element, options);
```

```javascript
const formElement = document.getElementById('my-form');
const formData = window.agentlet.forms.extract(formElement);
```

## Options

```javascript
const options = {
    includeHidden: false,    // Include hidden form fields
    includeDisabled: false,  // Include disabled form fields
    includeReadOnly: true,   // Include read-only form fields (default true)
    includeBoundingBoxes: false, // Include element positioning
    includePasswordValues: false, // Report password values (default false, see below)
};

const formData = window.agentlet.forms.extract(element, options);
```

Extra keys are accepted and forwarded to the internal element extraction, but only the keys above are read by the current implementation.

### Password fields

Since agentlet-core 2.3.0, a `type="password"` field is reported with a `null` value, and its `value` attribute is left out of `attributes`, because an extraction is usually sent to an AI provider or logged. The field itself is still listed, with its selector, label and constraints, so it can be filled. Pass `includePasswordValues: true` to get the value back, and only when the extraction stays on the page. The option must be the boolean `true`: any other value keeps passwords redacted.

## Output structure

```javascript
{
    metadata: {
        tagName: 'div',
        id: 'registration-form',
        className: 'form-container',
        url: 'https://example.com/register',
        title: 'Registration page',
    },
    forms: [
        {
            type: 'form',
            element: { /* a FormElementInfo describing the <form> itself */ },
            elements: [ /* FormElementInfo, one per field in this form */ ],
        },
    ],
    elements: [ /* FormElementInfo, fields with no enclosing <form> */ ],
    extractedAt: '2024-01-15T10:30:00.000Z',
}
```

Each field, in `forms[].elements` or the top-level `elements` array, is a `FormElementInfo`:

```javascript
{
    tagName: 'input',
    type: 'email',
    id: 'user-email',
    name: 'email',
    className: 'form-control required',
    selector: '#user-email',       // Single best selector for this element
    attributes: { type: 'email', name: 'email', required: 'true' },
    value: 'user@example.com',     // Shape depends on the field type, see below
    placeholder: 'Enter your email',
    required: true,
    disabled: false,
    readonly: false,
    visible: true,
    interactable: true,
    label: 'Email address',        // Or null if no label was found
    options: null,                 // Populated for select/radio/checkbox, see below
    // boundingBox is only present when includeBoundingBoxes is true:
    // { x, y, width, height, visible }
}
```

### `value` by field type

- Checkbox or radio: `{ checked: boolean, value: string }`
- Select: `{ selectedValue: string, selectedOptions: Array<{ value, text }> }`
- File input: `{ files: string[], accept: string }`
- Password input: `null`, unless `includePasswordValues: true` is passed
- Everything else (text, email, textarea, ...): a plain `string`, or `null`

### `options` by field type

- Select: `{ multiple: boolean, options: Array<{ index, value, text, selected, disabled }> }`
- Radio or checkbox group: `{ group: Array<{ index, value, checked, label }>, groupSize: number }`
- Everything else: `null`

See [Select options](/docs/guides/forms-select-options/) for a full walkthrough of the select and group shapes.

## Usage examples

### Extract a specific form

```javascript
const formElement = document.getElementById('registration-form');
const formData = window.agentlet.forms.extract(formElement, {
    includeHidden: true,
    includeBoundingBoxes: true,
});

formData.forms[0].elements.forEach((element) => {
    console.log(`${element.type}: ${element.name} - ${element.label}`);
});
```

### Find all forms on a page

```javascript
const pageData = window.agentlet.forms.extract(document.body);

pageData.forms.forEach((form, index) => {
    console.log(`Form ${index + 1}: ${form.elements.length} elements`);
    const requiredFields = form.elements.filter((el) => el.required);
    console.log(`Required fields: ${requiredFields.map((f) => f.name).join(', ')}`);
});
```

### Fill fields from extracted data

```javascript
function fillFromExtraction(formData, values) {
    for (const form of formData.forms) {
        for (const element of form.elements) {
            const value = values[element.name];
            if (value === undefined || !element.interactable) continue;

            const domElement = document.querySelector(element.selector);
            if (!domElement) continue;

            if (element.type === 'checkbox') {
                domElement.checked = Boolean(value);
                domElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                domElement.value = value;
                domElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}
```

For a higher-level API that already handles this dispatch logic and reports success and failure per field, use [form filling](/docs/guides/forms-filling/) instead of writing your own loop.

## Performance considerations

For large pages, limit the scope of extraction rather than scanning the whole document:

```javascript
const container = document.getElementById('main-content');
const formData = window.agentlet.forms.extract(container);

// Or extract a specific form only
const targetForm = document.querySelector('form[data-form="registration"]');
if (targetForm) {
    const formData = window.agentlet.forms.extract(targetForm);
}
```

## Error handling

```javascript
try {
    const formData = window.agentlet.forms.extract(element, options);

    if (!formData || (!formData.forms.length && !formData.elements.length)) {
        console.warn('No form elements found in the specified element');
    }
} catch (error) {
    console.error('Form extraction failed:', error);

    // Fallback to basic form detection
    const forms = element.querySelectorAll('form');
    const inputs = element.querySelectorAll('input, select, textarea');
    console.log(`Fallback found: ${forms.length} forms, ${inputs.length} inputs`);
}
```

For the clean, AI-oriented export instead of this full structure, see [AI-ready forms](/docs/guides/forms-ai-ready/).
