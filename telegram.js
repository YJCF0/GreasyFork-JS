// ==UserScript==
// @name         Telegram Web K 增强
// @namespace    https://web.telegram.org/k/
// @version      2.9.9
// @description  隐藏「所有」文件夹、过滤关键词消息、隐藏官方广告、添加视频网页全屏按钮、左右方向键快退/快进
// @author       YJCF
// @license      MIT
// @match        https://web.telegram.org/k/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const CONFIG = {
        hideAllTab: true,
        autoSelectFirstFolder: true,
        filterMessages: true,
        hideMatched: true,
        hideSponsoredAds: true,
        videoFullscreen: true,

        // 视频方向键快进/快退秒数
        videoSeekSeconds: 5,

        keywords: [
            '博彩', '刷单', '兼职日结', '彩票', '极搜', '六合彩', '返水'
        ]
    };

    const MESSAGE_SELECTOR =
        '.bubble[role="article"][data-mid]';

    const processedMessages = new WeakMap();

    let activeFullscreenViewer = null;
    let scheduled = false;

    const keywordPattern = CONFIG.keywords.length
        ? new RegExp(
            CONFIG.keywords
                .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|'),
            'i'
        )
        : null;

    // =========================================================
    // CSS
    // =========================================================

    const style = document.createElement('style');

    style.textContent = `

        /* 隐藏默认的「所有」文件夹 */
        ${CONFIG.hideAllTab ? `
        #folders-tabs > [role="tab"][data-filter-id="0"] {
            display: none !important;
        }
        ` : ''}

        /* 隐藏匹配关键词的完整消息 */
        .tm-ad-hidden {
            display: none !important;
        }

        /* =====================================================
           隐藏 Telegram 官方赞助广告
           ===================================================== */

        ${CONFIG.hideSponsoredAds ? `

        /* 顶部置顶赞助广告 */
        .topbar-floating-plates
        .pinned-container.pinned-sponsored {
            display: none !important;
        }

        /* 聊天消息列表中的官方赞助广告 */
        .bubble.is-sponsored {
            display: none !important;
        }

        ` : ''}

        /* 网页全屏按钮：匹配播放器控制栏 */
        .tm-video-fullscreen-btn {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 40px !important;
            width: 40px !important;
            min-width: 40px !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 4px !important;
            color: #fff !important;
            background: transparent !important;
            font-family: inherit !important;
            font-size: 30px !important;
            font-weight: normal !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            cursor: pointer !important;
        }

        .tm-video-fullscreen-btn:hover {
            background: rgba(255, 255, 255, .15) !important;
        }

        /* =====================================================
           视频网页全屏
           ===================================================== */

        .media-viewer-whole.tm-page-fullscreen {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            z-index: 2147483646 !important;
            background: #000 !important;
            overflow: hidden !important;
        }

        /* 隐藏不需要的查看器 UI */
        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-topbar,

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-caption,

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-album-thumbs,

        .media-viewer-whole.tm-page-fullscreen
        .zoom-container,

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-switcher {
            display: none !important;
        }

        /* 隐藏视频查看器的上一个 / 下一个切换按钮 */
        .media-viewer-whole.active.has-video
        .media-viewer-switcher {
            display: none !important;
        }

        /*
         * 注意：
         * 不隐藏 .media-viewer-movers！
         * 视频播放器就在这个容器内部。
         */

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-movers {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
        }

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-mover-wrapper {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
        }

        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-mover.center.active {
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            max-height: 100dvh !important;
            left: 50% !important;
            top: 50% !important;
        }

        /* 视频外层 */
        .media-viewer-whole.tm-page-fullscreen
        .media-viewer-aspecter {
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
        }

        /* 播放器 */
        .media-viewer-whole.tm-page-fullscreen
        .ckin__player {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
        }

        /* 视频 */
        .media-viewer-whole.tm-page-fullscreen
        video.ckin__video {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            object-fit: contain !important;
            vertical-align: top !important;
        }

        /* =====================================================
           修复网页全屏时播放器菜单被视频覆盖
           Telegram 将菜单直接挂载在 body 下
           ===================================================== */

        body > .btn-menu[role="menu"] {
            z-index: 2147483647 !important;
        }

    `;

    (document.head || document.documentElement).appendChild(style);

    // =========================================================
    // 文件夹
    // =========================================================

    function processFolders() {
        const tabs = document.querySelector('#folders-tabs');

        if (!tabs) return;
        if (!CONFIG.autoSelectFirstFolder) return;

        const allTab = tabs.querySelector(
            ':scope > [role="tab"][data-filter-id="0"]'
        );

        if (!allTab) return;

        const isAllActive =
            allTab.classList.contains('active') ||
            allTab.getAttribute('aria-selected') === 'true';

        if (!isAllActive) return;

        const firstTab = tabs.querySelector(
            ':scope > [role="tab"]:not([data-filter-id="0"])'
        );

        firstTab?.click();
    }

    // =========================================================
    // 消息关键词过滤
    // =========================================================

    function getMessageText(container) {
        const messageBody = container.querySelector('.message');

        if (messageBody) {
            return messageBody.innerText ||
                messageBody.textContent ||
                '';
        }

        return container.innerText ||
            container.textContent ||
            '';
    }

    function processMessages() {
        if (!CONFIG.filterMessages || !keywordPattern) return;

        document.querySelectorAll(MESSAGE_SELECTOR).forEach(message => {
            const text = getMessageText(message);

            if (processedMessages.get(message) === text) {
                return;
            }

            processedMessages.set(message, text);

            const matched = keywordPattern.test(text);

            message.classList.toggle(
                'tm-ad-hidden',
                CONFIG.hideMatched && matched
            );
        });
    }

    // =========================================================
    // 视频网页全屏
    // =========================================================

    function exitPageFullscreen(viewer = activeFullscreenViewer) {
        if (!viewer) return;

        viewer.classList.remove('tm-page-fullscreen');

        const button = viewer.querySelector(
            '.tm-video-fullscreen-btn'
        );

        if (button) {
            button.textContent = '⛶';
            button.title = '网页全屏';
        }

        if (activeFullscreenViewer === viewer) {
            activeFullscreenViewer = null;
        }
    }

    function togglePageFullscreen(viewer) {
        if (!viewer) return;

        if (viewer.classList.contains('tm-page-fullscreen')) {
            exitPageFullscreen(viewer);
            return;
        }

        if (
            activeFullscreenViewer &&
            activeFullscreenViewer !== viewer
        ) {
            exitPageFullscreen(activeFullscreenViewer);
        }

        viewer.classList.add('tm-page-fullscreen');

        activeFullscreenViewer = viewer;

        const button = viewer.querySelector(
            '.tm-video-fullscreen-btn'
        );

        if (button) {
            button.textContent = '⛶';
            button.title = '网页全屏';
        }
    }

    // =========================================================
    // 添加网页全屏按钮到默认控制栏
    // =========================================================

    function addVideoFullscreenButton(video) {
        const viewer = video.closest(
            '.media-viewer-whole.active.has-video'
        );

        if (!viewer) return;

        // Telegram 默认控制栏右侧区域
        const controls = viewer.querySelector(
            '.default__controls .right-controls'
        );

        // 控制栏尚未生成时，等待下一次 DOM 扫描
        if (!controls) return;

        // 已有按钮时不重复添加
        if (controls.querySelector('.tm-video-fullscreen-btn')) {
            return;
        }

        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'tm-video-fullscreen-btn';
        button.textContent = '⛶';
        button.title = '网页全屏';
        button.setAttribute('aria-label', '视频网页全屏');

        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            togglePageFullscreen(viewer);
        });

        controls.appendChild(button);
    }

    function processVideos() {
        if (!CONFIG.videoFullscreen) return;

        document.querySelectorAll(
            '.media-viewer-whole.active.has-video video.ckin__video'
        ).forEach(addVideoFullscreenButton);

        if (
            activeFullscreenViewer &&
            !activeFullscreenViewer.isConnected
        ) {
            activeFullscreenViewer = null;
        }
    }

    // =========================================================
    // 视频方向键控制
    // =========================================================

    document.addEventListener('keydown', event => {
        if (
            event.key !== 'ArrowLeft' &&
            event.key !== 'ArrowRight'
        ) {
            return;
        }

        // 不处理组合快捷键
        if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
        ) {
            return;
        }

        const target = event.target;

        // 不干扰普通文本输入框和编辑区域。
        // 特别排除所有 range：播放进度条、音量、缩放滑块
        // 都允许进入下面的视频快退/快进处理。
        if (
            target instanceof HTMLElement &&
            (
                target.isContentEditable ||
                target.matches(
                    'input:not([type="range"]), textarea, select, [contenteditable="true"]'
                )
            )
        ) {
            return;
        }

        const viewer = document.querySelector(
            '.media-viewer-whole.active.has-video'
        );

        if (!viewer) return;

        const video = viewer.querySelector('video.ckin__video');

        if (!video || video.readyState < 1) return;

        // 阻止 Telegram 切换上一个 / 下一个视频
        // 同时阻止 range 控件默认的方向键操作
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const offset = event.key === 'ArrowLeft'
            ? -CONFIG.videoSeekSeconds
            : CONFIG.videoSeekSeconds;

        const duration = video.duration;

        let targetTime = video.currentTime + offset;

        if (Number.isFinite(duration)) {
            targetTime = Math.min(targetTime, duration);
        }

        targetTime = Math.max(0, targetTime);

        try {
            video.currentTime = targetTime;
        } catch (error) {
            console.warn('[Telegram 增强] 视频跳转失败：', error);
        }

    }, true);

    // =========================================================
    // ESC 退出网页全屏
    // =========================================================

    document.addEventListener('keydown', event => {
        if (
            event.key === 'Escape' &&
            activeFullscreenViewer
        ) {
            exitPageFullscreen();
        }
    }, true);

    // =========================================================
    // 页面扫描与 DOM 监听
    // =========================================================

    function run() {
        scheduled = false;

        processFolders();
        processMessages();
        processVideos();
    }

    function scheduleRun() {
        if (scheduled) return;

        scheduled = true;

        requestAnimationFrame(run);
    }

    const observer = new MutationObserver(scheduleRun);

    function startObserver() {
        if (!document.documentElement) {
            requestAnimationFrame(startObserver);
            return;
        }

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                'class',
                'aria-selected',
                'data-filter-id'
            ]
        });

        scheduleRun();
    }

    startObserver();

})();
