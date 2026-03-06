'use strict';

var obsidian = require('obsidian');

class ImageToolkitFixPlugin extends obsidian.Plugin {
    onload() {
        this._patchConsoleError();
        this.app.workspace.onLayoutReady(() => {
            this._registerEditorClickFix();
            this._patchRefreshImg();
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

    _patchRefreshImg() {
        const toolkit = this.app.plugins.plugins['obsidian-image-toolkit'];
        if (!toolkit || !toolkit.containerFactory) return;

        // Wrap getContainer to patch each container's refreshImg on first access
        const origGetContainer = toolkit.containerFactory.getContainer.bind(toolkit.containerFactory);
        const self = this;
        toolkit.containerFactory.getContainer = function (targetEl) {
            const container = origGetContainer(targetEl);
            if (container && !container._refreshImgPatched) {
                self._wrapRefreshImg(container);
            }
            return container;
        };
    }

    _wrapRefreshImg(container) {
        container._refreshImgPatched = true;
        const origRefreshImg = container.refreshImg;

        container.refreshImg = function (imgCto, imgSrc, imgAlt, imgTitleIndex) {
            // Call the original refreshImg
            origRefreshImg(imgCto, imgSrc, imgAlt, imgTitleIndex);

            // Add a safety timeout: if after 2.5s the interval is still running,
            // the image probably failed to load — force render using the original element
            setTimeout(() => {
                if (imgCto.refreshImgInterval) {
                    clearInterval(imgCto.refreshImgInterval);
                    imgCto.refreshImgInterval = null;

                    const src = imgSrc || imgCto.imgViewEl.src;
                    const alt = imgAlt || imgCto.imgViewEl.alt;
                    const origEl = imgCto.targetOriginalImgEl;

                    if (origEl && origEl.naturalWidth > 0) {
                        // Directly set the image and show it — skip zoom calculation
                        imgCto.imgViewEl.src = src;
                        imgCto.imgViewEl.alt = alt;
                        imgCto.imgViewEl.style.setProperty('max-width', '100%');
                        imgCto.imgViewEl.style.setProperty('max-height', '100%');
                    }

                    container.renderImgView(imgCto.imgViewEl, src, alt);
                    container.renderImgTip(imgCto);
                    imgCto.imgViewEl.style.setProperty('transform', imgCto.defaultImgStyle.transform);
                    imgCto.imgViewEl.style.setProperty('filter', imgCto.defaultImgStyle.filter);
                    imgCto.imgViewEl.style.setProperty('mix-blend-mode', imgCto.defaultImgStyle.mixBlendMode);
                }
            }, 2500);
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
