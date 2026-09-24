---
title: Select options
description: How select, radio, and checkbox options are represented.
---

[Form extraction](/docs/guides/forms-extraction/) and the [AI-ready export](/docs/guides/forms-ai-ready/) both report `<select>` options and radio or checkbox groups through the `options` field of a form element.

## Select elements

For a `<select>`, `options` (a `FormElementOptionsInfo`) has this shape:

```javascript
{
    multiple: false,  // Whether multi-select is enabled
    options: [
        { index: 0, value: 'us', text: 'United States', selected: true, disabled: false },
        { index: 1, value: 'ca', text: 'Canada', selected: false, disabled: false },
    ],
}
```

Each entry in `options.options` describes one `<option>`:

- `index`: position in the list, 0-based
- `value`: the option's `value` attribute
- `text`: displayed text content
- `selected`: current selection state
- `disabled`: whether the option is disabled

The field's own `value` (on the raw `FormElementInfo`, see [form extraction](/docs/guides/forms-extraction/)) carries the current selection separately:

```javascript
{
    selectedValue: 'ca',
    selectedOptions: [{ value: 'ca', text: 'Canada' }],
}
```

## Radio and checkbox groups

Related radio buttons or checkboxes sharing a `name` are grouped instead:

```javascript
{
    group: [
        { index: 0, value: 'daily', checked: false, label: 'Daily' },
        { index: 1, value: 'weekly', checked: true, label: 'Weekly' },
        { index: 2, value: 'monthly', checked: false, label: 'Monthly' },
    ],
    groupSize: 3,
}
```

## Usage examples

### List every select's options

```javascript
const formData = window.agentlet.forms.extract(document.body);

formData.forms.forEach((form) => {
    form.elements.forEach((element) => {
        if (element.type !== 'select' || !element.options) return;
        console.log(`Select: ${element.name} (${element.options.options.length} options)`);
        element.options.options.forEach((option) => {
            console.log(`- ${option.text} (${option.value})${option.selected ? ' [selected]' : ''}`);
        });
    });
});
```

### Collect options for AI

```javascript
function getSelectOptions(formData) {
    const selectData = {};

    formData.forms.forEach((form) => {
        form.elements.forEach((element) => {
            if (element.type !== 'select' || !element.options) return;
            selectData[element.name] = {
                multiple: element.options.multiple,
                options: element.options.options.map((opt) => ({ value: opt.value, text: opt.text })),
                currentSelection: element.options.options.filter((opt) => opt.selected).map((opt) => opt.value),
            };
        });
    });

    return selectData;
}
```

### Validate a value before filling a select

```javascript
function isValidOption(selectElementInfo, desiredValue) {
    if (!selectElementInfo.options) return false;
    return selectElementInfo.options.options.some((opt) => opt.value === desiredValue && !opt.disabled);
}
```

Source: agentlet-core docs/select-options-extraction.md and src/types/public-api.d.ts at e3f78fa. The source document additionally described `defaultSelected`, a `size` property, and an optgroup `group` label on each option; these are not part of the current `FormElementOptionsInfo` type, so they were not carried over.
