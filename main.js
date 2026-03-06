'use strict';

var obsidian = require('obsidian');

class ImageToolkitFixPlugin extends obsidian.Plugin {
    onload() {
        this._patchConsoleError();
        this.app.workspace.onLayoutReady(() => {
            this._registerEditorClickFix();
        });
    }

    onunload() {
        if (this._origConsoleError) {
            console.error = this._origConsoleError;
        }
        if (this._cleanupListeners) {
            this._cleanupListeners();
        }
    }

    _patchConsoleError() {
        const orig = console.error;
        this._origConsoleError = orig;
        console.error = function (...args) {
            if (typeof args[0] === 'string' && args[0].includes('[oit] Image toolkit locale not found')) {
                return;
            }
            orig.apply(console, args);
        };
    }

    _registerEditorClickFix() {
        const doc = document;
        let pointerDownTime = 0;

        const onPointerDown = () => {
            pointerDownTime = Date.now();
        };

        const onPointerUp = (event) => {
            const el = event.target;
            if (!el) return;

            // Find the actual img element (in editor, click lands on the embed DIV, not the img)
            let imgEl = null;
            if (el.tagName === 'IMG') {
                imgEl = el;
            } else if (el.closest) {
                // Only match actual image embeds, not Dataview/Excalidraw/other embed blocks
                const embed = el.closest('.internal-embed.image-embed');
                if (embed) imgEl = embed.querySelector('img');
            }
            if (!imgEl) return;

            // Only quick clicks, not drags
            if (Date.now() - pointerDownTime > 300) return;

            // Only in markdown views
            if (!imgEl.closest('.workspace-leaf-content[data-type="markdown"]')) return;

            // Only in editor (CodeMirror) areas — reading view already works
            if (!imgEl.closest('.cm-editor')) return;

            // Get image-toolkit plugin and trigger its click handler
            const toolkit = this.app.plugins.plugins['obsidian-image-toolkit'];
            if (!toolkit || !toolkit.clickImage) return;

            toolkit.clickImage({
                target: imgEl,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                metaKey: event.metaKey
            });
        };

        const boundPointerUp = onPointerUp.bind(this);
        doc.addEventListener('pointerdown', onPointerDown, true);
        doc.addEventListener('pointerup', boundPointerUp, true);

        this._cleanupListeners = () => {
            doc.removeEventListener('pointerdown', onPointerDown, true);
            doc.removeEventListener('pointerup', boundPointerUp, true);
        };
    }
}

module.exports = ImageToolkitFixPlugin;
