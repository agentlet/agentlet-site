---
title: Form filling
description: Fill forms safely with selectors scoped to a parent element.
---

The `FormFiller` fills form fields using selectors scoped to a parent element, so filling a field in one form never accidentally touches a same-named field in another form on the same page.

## `fill(parentElement, selectorValues, options)`

```javascript
const result = window.agentlet.forms.fill(parentElement, selectorValues, options);
```

`selectorValues` accepts two formats:

```javascript
// Object format: { selector: value }
const selectorValues = {
    '#name': 'John Doe',
    '#email': 'john@example.com',
    '[name="country"]': 'us',
    '.checkbox-newsletter': true,
};

// Array format: [{ selector, value, type? }]
const selectorValues = [
    { selector: '#name', value: 'John Doe' },
    { selector: '#country', value: 'us', type: 'select' },
    { selector: '#newsletter', value: true, type: 'checkbox' },
];
```

A value is either a `string` or a `boolean` (`FormFillValue`).

## Options

```javascript
const options = {
    triggerEvents: true,  // Dispatch input/change events after setting a value (default true)
    skipDisabled: true,   // Skip disabled elements
    skipReadonly: true,   // Skip readonly elements
    skipHidden: true,     // Skip hidden elements
    validateFields: true, // Validate values before filling
    debugMode: false,     // Enable debug logging
};
```

## Return value

```javascript
{
    total: 5,
    successful: 4,
    failed: 1,
    skipped: 0,
    details: [
        {
            selector: '#name',
            status: 'success',
            value: 'John Doe',
            element: { tagName: 'input', type: 'text', id: 'name', name: 'name', visible: true, enabled: true },
        },
        {
            selector: '#invalid',
            status: 'error',
            error: 'Element not found with selector: #invalid',
            element: null,
        },
    ],
    errors: ['Element not found with selector: #invalid'],
}
```

Each entry in `details` has `status: 'success'`, `'skipped'` (with a `reason`), or `'error'` (with an `error` message and `element: null`).

## `fillFromAI(parentElement, aiFormData, userValues, options)`

Fills a form using the structure returned by [`exportForAI`](/docs/guides/forms-ai-ready/), matching fields by name against `userValues`:

```javascript
const aiFormData = window.agentlet.forms.exportForAI(document.body);
const userValues = {
    firstName: 'Jane',
    email: 'jane.smith@example.com',
    country: 'ca',
};

const result = window.agentlet.forms.fillFromAI(document.body, aiFormData, userValues, {
    triggerEvents: true,
    validateFields: true,
});
```

## `fillMultiple(parentElement, formDataArray, options)`

Fills several selector sets in sequence, with retry logic per set:

```javascript
const steps = [
    {
        selectors: { '#step1-name': 'John Doe', '#step1-email': 'john@example.com' },
        retryAttempts: 3,
    },
    {
        selectors: { '#step2-address': '123 Main St', '#step2-city': 'Anytown' },
    },
];

const results = await window.agentlet.forms.fillMultiple(container, steps, {
    triggerEvents: true,
});

results.forEach((result, index) => {
    console.log(`Step ${index + 1}: ${result.successful}/${result.total} successful`);
});
```

`retryAttempts` defaults to `1`. Retries use a fixed 500ms delay and stop once a set fills with zero failures.

## Element type support

```javascript
// Text inputs: text, password, email, url, tel, search, number, hidden
window.agentlet.forms.fill(form, {
    '#name': 'John Doe',
    '#email': 'john@example.com',
});

// Select
window.agentlet.forms.fill(form, { '#country': 'us' });

// Checkbox: boolean or truthy/falsy string
window.agentlet.forms.fill(form, { '#newsletter': true, '#marketing': false });

// Radio: match a specific value on the group's name
window.agentlet.forms.fill(form, { '[name="color"]': 'blue' });

// Textarea
window.agentlet.forms.fill(form, { '#message': 'Multi-line\ntext works too.' });

// Date and time inputs
window.agentlet.forms.fill(form, {
    '#birthday': '1990-05-15',
    '#appointment': '2024-01-15T14:30',
    '#meeting': '14:30',
});
```

## Scoped selection

All selectors resolve through `parentElement.querySelector()`, which prevents accidental modification of elements outside the target area and cross-form interference:

```javascript
const registrationForm = document.getElementById('registration-form');
const loginForm = document.getElementById('login-form');

window.agentlet.forms.fill(registrationForm, { '#email': 'register@example.com' });
window.agentlet.forms.fill(loginForm, { '#email': 'login@example.com' });

// No conflict between the two forms, even though both have an #email field.
```

## Error handling

```javascript
const result = window.agentlet.forms.fill(form, data);

result.details.forEach((detail) => {
    switch (detail.status) {
        case 'success':
            console.log(`Filled ${detail.selector}: ${detail.value}`);
            break;
        case 'error':
            console.error(`Failed ${detail.selector}: ${detail.error}`);
            break;
        case 'skipped':
            console.warn(`Skipped ${detail.selector}: ${detail.reason}`);
            break;
    }
});

if (result.successful < result.total) {
    console.warn(`Partial success: ${result.successful}/${result.total} fields filled`);
}
```

Source: agentlet-core docs/form-filling-api.md and src/types/public-api.d.ts at e3f78fa. Options and callbacks not present in the current `FormFillOptions`/`FormFillResult` types (`validateValues`, `waitForElement`, `onSuccess`/`onError`/`onSkipped` callbacks) were dropped in favor of the documented `validateFields` option and the returned `details`/`errors` arrays.
