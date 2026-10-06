---
title: AI
description: Send prompts, images, and PDF documents to the configured AI provider.
---

`window.agentlet.ai` gives direct access to an AI provider (OpenAI today) with support for text, images, and PDF documents.

## Check availability

```javascript
const isAvailable = window.agentlet.ai.isAvailable();
```

## Send a text prompt

```javascript
const response = await window.agentlet.ai.sendPrompt('Analyze this data and provide insights');
```

`sendPrompt` resolves to the assistant's raw text reply. It throws if no provider is configured.

## Send a prompt with images

```javascript
const images = [screenshotBase64, documentImage]; // Data URLs, http(s) URLs, or bare base64 strings
const analysis = await window.agentlet.ai.sendPrompt('What do you see in these images?', images);
```

## Send a prompt with a PDF document

```javascript
const fileInput = document.getElementById('pdfFile');

const pdfAnalysis = await window.agentlet.ai.sendPromptWithPDF(
    'Analyze this PDF document and summarize the key points',
    fileInput.files[0], // File, ArrayBuffer, Uint8Array, or an http(s) URL string
    {
        pdfOptions: {
            scale: 1.5,   // Higher resolution
            maxPages: 10, // Limit pages for efficiency
            format: 'image/png',
        },
        showInConsole: true, // Display converted images in console (default true)
    }
);
```

`sendPromptWithPDF` converts the PDF to images internally, then behaves like `sendPrompt`.

### Convert a PDF to images without sending it to AI

```javascript
const pdfImages = await window.agentlet.ai.convertPDFToImages(fileInput.files[0]);
// Resolves to an array of base64 data URL image strings, one per page
```

## Status and providers

```javascript
const status = window.agentlet.ai.getStatus();
console.log(status.currentProvider);              // 'openai'
console.log(status.available);                    // true or false
console.log(status.pdfSupport.available);          // true or false
console.log(status.pdfSupport.capabilities.maxRecommendedPages); // 10

const providers = window.agentlet.ai.getAvailableProviders();
window.agentlet.ai.setProvider('openai');
```

Validate the current configuration against the provider, useful for a settings screen:

```javascript
const result = await window.agentlet.ai.validateAPI();
if (result.success) {
    console.log(result.details.model, result.details.responseTime);
} else {
    console.error(result.error);
}
```

## Configuring credentials

AI credentials are read from environment variables managed by `window.agentlet.env`. See [Environment variables](/docs/guides/environment-variables/) for the full API.

```javascript
window.agentlet.env.OPENAI_API_KEY = 'sk-...';
window.agentlet.env.OPENAI_MODEL = 'gpt-6-luna'; // Optional, this is the default
window.agentlet.ai.refresh(); // Refresh after env changes
```

`OPENAI_MODEL` is optional. Since agentlet-core 2.4.0, the default model is `gpt-6-luna` (earlier releases default to `gpt-4o-mini`). Set `OPENAI_MODEL` to use another model, including an older one such as `gpt-4o-mini`.

The provider adapts the request to the model. Classic models such as `gpt-4o-mini` receive `max_tokens` and `temperature`. The `gpt-5`, `gpt-6` and `o`-series models receive `max_completion_tokens` instead, and no `temperature` (they reject it while reasoning is on). `gpt-6-luna` and `gpt-6-sol` are sent `reasoning_effort: "none"` so the token budget goes to the answer, which also keeps `temperature` valid.

## Direct access to the manager

`window.agentlet.ai.manager` (also `window.agentlet.aiManager`) is the underlying `AIManager` instance, exposing the same methods plus `getCurrentProvider()`.
