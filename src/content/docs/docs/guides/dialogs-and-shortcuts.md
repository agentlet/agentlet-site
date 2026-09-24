---
title: Dialogs and shortcuts
description: Show dialogs and toasts, and register keyboard shortcuts.
---

## Dialog

`window.agentlet.utils.Dialog` is a singleton that renders info, input, wait, progress, fullscreen, and command-prompt dialogs inside the agentlet UI root.

### Convenience methods

```javascript
window.agentlet.utils.Dialog.info('Saved successfully.');
window.agentlet.utils.Dialog.success('Saved successfully.', 'Done');
window.agentlet.utils.Dialog.warning('Check the highlighted fields.');
window.agentlet.utils.Dialog.error('Something went wrong.');

window.agentlet.utils.Dialog.confirm('Delete this record?', 'Confirm', (value) => {
    // value is 'confirm' or 'cancel'
});

window.agentlet.utils.Dialog.yesNo('Continue?', 'Confirm', (value) => {
    // value is 'yes' or 'no'
});

window.agentlet.utils.Dialog.choice(
    'Pick an environment',
    ['staging', 'production'],
    'Deploy target',
    (value) => console.log(value)
);
```

### Prompts

```javascript
window.agentlet.utils.Dialog.prompt('Your name?', 'Jane Doe', (value) => console.log(value));
window.agentlet.utils.Dialog.promptPassword('Your password?', (value) => console.log(value));
window.agentlet.utils.Dialog.promptEmail('Your email?', '', (value) => console.log(value));
window.agentlet.utils.Dialog.promptTextarea('Notes?', '', 4, (value) => console.log(value));
```

### Wait and progress

```javascript
window.agentlet.utils.Dialog.showLoading('Working...');
// ... later
window.agentlet.utils.Dialog.hide();

window.agentlet.utils.Dialog
    .showProgress({ title: 'Exporting', showPercentage: true, totalSteps: 3 })
    .updateProgress(33, 'Step 1 of 3')
    .setStep(1, 'Fetching data')
    .completeProgress('Done');
```

`showProgress` (and `show('progress', ...)`) returns the `Dialog` instance so calls can be chained.

### Full control with `show()`

Every convenience method is built on `show(type, options, callback)`:

```javascript
window.agentlet.utils.Dialog.show(
    'info',
    {
        title: 'Heads up',
        message: 'This action cannot be undone.',
        buttons: [
            { text: 'Cancel', value: 'cancel' },
            { text: 'Continue', value: 'continue', primary: true },
        ],
    },
    (value) => console.log('chosen:', value)
);
```

`type` is one of `'info'`, `'input'`, `'wait'`, `'progress'`, `'fullscreen'`, or `'command'`; each has its own options shape (`DialogInfoOptions`, `DialogInputOptions`, and so on).

### Quick command prompt

```javascript
window.agentlet.utils.Dialog.quickCommand('Type a command...', (value) => {
    console.log('command:', value);
});
```

## MessageBubble

`window.agentlet.utils.MessageBubble` shows toast-style notifications.

```javascript
window.agentlet.utils.MessageBubble.success('Saved');
window.agentlet.utils.MessageBubble.error('Failed to save', { duration: 0 }); // 0 disables auto-hide
window.agentlet.utils.MessageBubble.info('3 records updated', { position: 'bottom-right' });

const id = window.agentlet.utils.MessageBubble.loading('Working...');
// ... later
window.agentlet.utils.MessageBubble.hide(id);
```

`toast(message, type, duration)` and `notify(message, type, title)` are shorthand variants; `hideAll()` clears every visible bubble.

## Keyboard shortcuts

Enable the built-in quick command shortcut (`Ctrl`/`Cmd`+`;`, disabled by default) through the `AgentletCore` config:

```javascript
const agentlet = new AgentletCore({
    quickCommandDialogShortcut: true,
    quickCommandCallback: (result) => {
        console.log('User entered command:', result);
        if (result === 'help') {
            window.agentlet.utils.Dialog.info('Available commands: help, clear, export');
        }
    },
});
```

Register additional shortcuts directly through `window.agentlet.utils.shortcuts` (`null` if no shortcut manager was configured):

```javascript
await window.agentlet.utils.shortcuts.register(
    'ctrl+shift+e',
    (event, handler) => {
        exportCurrentView();
    },
    { description: 'Export the current view', preventDefault: true }
);

window.agentlet.utils.shortcuts.unregister('ctrl+shift+e');
window.agentlet.utils.shortcuts.showHelp();
```

`register()` resolves to `false`, rather than throwing, if the underlying hotkeys library could not be loaded or the arguments are invalid.

Source: agentlet-core CLAUDE.md, API Quick Reference ("Keyboard shortcuts"), and src/types/public-api.d.ts at e3f78fa.
