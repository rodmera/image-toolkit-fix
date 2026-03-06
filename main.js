'use strict';

var obsidian = require('obsidian');

const ZOOM_FACTOR = 0.8;

function calculateImgZoomSize(realWidth, realHeight, imgCto, windowWidth, windowHeight) {
    if (!windowWidth) {
        windowWidth = document.documentElement.clientWidth || document.body.clientWidth;
    }
    if (!windowHeight) {
        windowHeight = (document.documentElement.clientHeight || document.body.clientHeight) - 100;
    }
    const windowZoomWidth = windowWidth * ZOOM_FACTOR;
    const windowZoomHeight = windowHeight * ZOOM_FACTOR;
    let tempWidth = realWidth, tempHeight = realHeight;
    if (realHeight > windowZoomHeight) {
        tempHeight = windowZoomHeight;
        if ((tempWidth = tempHeight / realHeight * realWidth) > windowZoomWidth) {
            tempWidth = windowZoomWidth;
        }
    } else if (realWidth > windowZoomWidth) {
        tempWidth = windowZoomWidth;
        tempHeight = tempWidth / realWidth * realHeight;
    }
    tempHeight = tempWidth * realHeight / realWidth;
    imgCto.left = (windowWidth - tempWidth) / 2;
    imgCto.top = (windowHeight - tempHeight) / 2;
    imgCto.curWidth = tempWidth;
    imgCto.curHeight = tempHeight;
    imgCto.realWidth = realWidth;
    imgCto.realHeight = realHeight;
    return imgCto;
}

function doFullRender(container, imgCto, imgSrc, imgAlt) {
    const parentEl = container.parentContainerEl;
    const w = parentEl ? parentEl.clientWidth : undefined;
    const h = parentEl ? parentEl.clientHeight : undefined;
    calculateImgZoomSize(imgCto._fallbackWidth, imgCto._fallbackHeight, imgCto, w, h);
    container.setImgViewPosition(imgCto, 0);
    container.renderImgView(imgCto.imgViewEl, imgSrc, imgAlt);
    container.renderImgTip(imgCto);
    imgCto.imgViewEl.style.setProperty('transform', imgCto.defaultImgStyle.transform);
    imgCto.imgViewEl.style.setProperty('filter', imgCto.defaultImgStyle.filter);
    imgCto.imgViewEl.style.setProperty('mix-blend-mode', imgCto.defaultImgStyle.mixBlendMode);
}

class ImageToolkitFixPlugin extends obsidian.Plugin {
    onload() {
        this._patchConsoleError();
        this.app.workspace.onLayoutReady(() => {
            this._patchToolkitContainers();
            this._registerEditorClickFix();
            this._registerNavigationCleanup();
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

    // Single place to patch all container methods (refreshImg + closeContainerView)
    _patchToolkitContainers() {
        const toolkit = this.app.plugins.plugins['obsidian-image-toolkit'];
        if (!toolkit || !toolkit.containerFactory) return;

        const self = this;

        // Patch existing containers
        const allContainers = toolkit.containerFactory.getAllContainers();
        for (const c of allContainers) {
            this._patchContainer(c);
        }

        // Wrap getContainer to patch future containers on first access
        const origGetContainer = toolkit.containerFactory.getContainer.bind(toolkit.containerFactory);
        toolkit.containerFactory.getContainer = function (targetEl) {
            const container = origGetContainer(targetEl);
            if (container) self._patchContainer(container);
            return container;
        };
    }

    _patchContainer(container) {
        if (!container || container._itfPatched) return;
        container._itfPatched = true;

        const self = this;

        // Patch refreshImg: add onerror + retry timeout fallback
        const origRefreshImg = container.refreshImg;
        container.refreshImg = function (imgCto, imgSrc, imgAlt, imgTitleIndex) {
            if (!imgSrc) imgSrc = imgCto.imgViewEl.src;
            if (!imgAlt) imgAlt = imgCto.imgViewEl.alt;
            container.renderImgTitle(imgAlt, imgTitleIndex);
            if (!imgSrc) return;

            if (imgCto.refreshImgInterval) {
                clearInterval(imgCto.refreshImgInterval);
                imgCto.refreshImgInterval = null;
            }

            let realImg = new Image();
            let retryCount = 0;

            realImg.onerror = () => {
                if (imgCto.refreshImgInterval) {
                    clearInterval(imgCto.refreshImgInterval);
                    imgCto.refreshImgInterval = null;
                }
                const origEl = imgCto.targetOriginalImgEl;
                if (origEl && origEl.naturalWidth > 0) {
                    imgCto._fallbackWidth = origEl.naturalWidth;
                    imgCto._fallbackHeight = origEl.naturalHeight;
                    doFullRender(container, imgCto, imgSrc, imgAlt);
                }
            };

            realImg.src = imgSrc;

            imgCto.refreshImgInterval = setInterval((realImg) => {
                if (realImg.width > 0 || realImg.height > 0) {
                    clearInterval(imgCto.refreshImgInterval);
                    imgCto.refreshImgInterval = null;
                    imgCto._fallbackWidth = realImg.width;
                    imgCto._fallbackHeight = realImg.height;
                    doFullRender(container, imgCto, imgSrc, imgAlt);
                } else if (++retryCount > 50) {
                    clearInterval(imgCto.refreshImgInterval);
                    imgCto.refreshImgInterval = null;
                    const origEl = imgCto.targetOriginalImgEl;
                    if (origEl && origEl.naturalWidth > 0) {
                        imgCto._fallbackWidth = origEl.naturalWidth;
                        imgCto._fallbackHeight = origEl.naturalHeight;
                        doFullRender(container, imgCto, imgSrc, imgAlt);
                    }
                }
            }, 40, realImg);
        };

        // Patch close handlers: refocus editor after overlay closes
        const origClose = container.closeContainerView.bind(container);
        container.closeContainerView = function (event, activeImg) {
            origClose(event, activeImg);
            setTimeout(() => self._refocusEditor(), 50);
        };

        const origRemove = container.removeOitContainerView.bind(container);
        container.removeOitContainerView = function () {
            origRemove();
            setTimeout(() => self._refocusEditor(), 50);
        };
    }

    _refocusEditor() {
        const leaf = this.app.workspace.activeLeaf;
        if (leaf && leaf.view && leaf.view.editor) {
            leaf.view.editor.focus();
        }
    }

    _registerNavigationCleanup() {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const toolkit = this.app.plugins.plugins['obsidian-image-toolkit'];
                if (!toolkit || !toolkit.containerFactory) return;
                const containers = toolkit.containerFactory.getAllContainers();
                for (const c of containers) {
                    if (c && c.imgGlobalStatus && c.imgGlobalStatus.popup) {
                        c.removeOitContainerView();
                    }
                }
            })
        );
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

            // Find the actual img element
            let imgEl = null;
            if (el.tagName === 'IMG') {
                imgEl = el;
            } else if (el.closest) {
                const embed = el.closest('.image-embed');
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
