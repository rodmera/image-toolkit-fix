# Image Toolkit Fix

Companion plugin for [obsidian-image-toolkit](https://github.com/sissilab/obsidian-image-toolkit) that fixes two issues without modifying the original plugin code.

## What it fixes

### 1. Image click not working in Editor view (Live Preview)

Obsidian's editor uses CodeMirror 6, which intercepts click events and prevents them from bubbling up to the document. Since `obsidian-image-toolkit` relies on event delegation (`doc.on('click', ...)`) to detect image clicks, the popup never triggers in Editor/Live Preview mode — only in Reading view.

This plugin registers a capture-phase `pointerup` listener that detects clicks on images inside the editor, finds the `<img>` element within the embed container, and calls the toolkit's `clickImage` handler directly.

### 2. Console error spam for non-English locales

`obsidian-image-toolkit` only includes translations for `en`, `zh-cn`, and `zh-tw`. If Obsidian is set to any other language (e.g. `es`), the function `t()` logs `[oit] Image toolkit locale not found` on every call, flooding the developer console. The plugin falls back to English regardless, so the error is purely noise.

This plugin suppresses that specific `console.error` message.

## Installation

1. Copy the `image-toolkit-fix` folder into your vault's `.obsidian/plugins/` directory
2. Restart Obsidian
3. Enable **Image Toolkit Fix** in Settings > Community Plugins

Requires `obsidian-image-toolkit` to be installed and enabled.

## Why a separate plugin?

Modifying `obsidian-image-toolkit`'s `main.js` directly works, but any plugin update overwrites those changes. This companion plugin applies fixes at runtime, so the original can update freely without losing the fixes.
