// ==UserScript==
// @name         Warframe Market 快捷复制
// @namespace    https://warframe.market/
// @version      1.0.0
// @description  一键复制中文物品名称、订单买卖私聊指令以及裂罅、玄骸和姐妹拍卖购买指令
// @author       YJCF
// @license      MIT
// @match        https://warframe.market/zh-hans/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
    'use strict';

    const BUTTON_CLASS = 'copy-name-btn';
    const AUCTION_BUTTON_CLASS = 'wfm-auction-copy-button';
    const STYLE_ID = 'wm-copy-button-style';
    const TOAST_ID = 'wm-quick-copy-toast';

    function getText(element) {
        return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    function getPrice(element) {
        if (!element) return '';

        const priceElement =
            element.querySelector('[class*="price"] b') ||
            element.querySelector('[class*="price"]');

        const text = getText(priceElement || element);
        const match = text.match(/\d+(?:[.,]\d+)?/);

        return match ? match[0].replace(',', '.') : '';
    }

    function getUsername(element) {
        if (!element) return '';

        const profileLink = element.matches?.('a[href*="/profile/"]')
            ? element
            : element.querySelector('a[href*="/profile/"]');

        const nameElement =
            profileLink?.querySelector('[class*="name--"]') ||
            profileLink?.querySelector('[class*="name"]');

        if (nameElement) {
            return getText(nameElement);
        }

        const href = profileLink?.getAttribute('href');

        if (href) {
            return decodeURIComponent(
                href.split('/profile/')[1]?.split(/[/?#]/)[0] || ''
            );
        }

        return '';
    }

    function getItemNameFromSlug() {
        const match = location.pathname.match(/\/items\/([^/?#]+)/i);

        if (!match) return '';

        return decodeURIComponent(match[1])
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    async function copyText(text) {
        if (!text) {
            showToast('没有找到可复制的内容', false);
            return false;
        }

        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                return true;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }

            const textarea = document.createElement('textarea');

            textarea.value = text;
            textarea.readOnly = true;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';

            document.body.appendChild(textarea);
            textarea.select();

            const success = document.execCommand('copy');

            textarea.remove();

            if (!success) {
                throw new Error('复制失败');
            }

            return true;
        } catch (error) {
            console.error('[Warframe Market]', error);
            return false;
        }
    }

    function showToast(message, success = true) {
        if (!document.body) return;

        let toast = document.querySelector(`#${TOAST_ID}`);

        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        toast.style.background = success
            ? 'rgba(35, 40, 48, .96)'
            : '#b83232';

        clearTimeout(toast._timer);

        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 1600);
    }

    function makeWhisper(username, action, itemName, price) {
        if (!username || !itemName || !price || !action) {
            return '';
        }

        return `/w ${username} Hi! I want to ${action}: "${itemName}" for ${price} platinum. (warframe.market)`;
    }

    function getOrderUnitInfo(order, button) {
        const username = getUsername(order);

        const nameElement =
            order.querySelector('[class*="original-name"]') ||
            order.querySelector('[class*="item-name"] a');

        const itemName = getText(nameElement);

        const priceElement =
            order.querySelector('[class*="order-unit__price"]') ||
            order.querySelector('[class*="price"]');

        const price = getPrice(priceElement);
        const buttonText = getText(button);

        let action = '';

        if (buttonText.includes('买')) {
            action = 'buy';
        } else if (buttonText.includes('卖')) {
            action = 'sell';
        }

        return {
            username,
            itemName,
            price,
            action
        };
    }

    function getOrderRowInfo(order, button) {
        const username = getUsername(order);
        const itemName = getItemNameFromSlug();

        const priceElement =
            order.querySelector('[class*="order-row__price"]') ||
            order.querySelector('[class*="price"]');

        const price = getPrice(priceElement);
        const buttonText = getText(button);

        let action = '';

        if (buttonText.includes('买')) {
            action = 'buy';
        } else if (buttonText.includes('卖')) {
            action = 'sell';
        }

        return {
            username,
            itemName,
            price,
            action
        };
    }

    function handleTradeClick(event) {
        const target = event.target;

        if (!(target instanceof Element)) return;

        const button = target.closest('button');

        if (!button) return;

        if (
            button.classList.contains(BUTTON_CLASS) ||
            button.classList.contains(AUCTION_BUTTON_CLASS)
        ) {
            return;
        }

        const orderUnit = button.closest('[class*="order-unit--"]');
        const orderRow = button.closest('[class*="order-row--"]');

        if (!orderUnit && !orderRow) return;

        const buttonText = getText(button);

        if (!buttonText.includes('买') && !buttonText.includes('卖')) {
            return;
        }

        const info = orderUnit
            ? getOrderUnitInfo(orderUnit, button)
            : getOrderRowInfo(orderRow, button);

        const message = makeWhisper(
            info.username,
            info.action,
            info.itemName,
            info.price
        );

        if (!message) {
            console.warn(
                '[Warframe Market] 无法解析订单信息',
                info
            );
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        copyText(message).then(success => {
            if (success) {
                showToast('已复制私聊指令');

                console.log(
                    '[Warframe Market] 已复制：',
                    message
                );
            } else {
                showToast('复制失败，请检查浏览器权限', false);
            }
        });
    }

    document.addEventListener('click', handleTradeClick, true);

    function getChineseName(link) {
        const span =
            link.querySelector('span:not([class*="original-name"])') ||
            link.querySelector('span');

        return (
            span?.textContent ||
            link.textContent ||
            ''
        ).trim();
    }

    function createCopyButton(link) {
        const button = document.createElement('button');

        button.className = BUTTON_CLASS;
        button.type = 'button';
        button.textContent = '📋 复制';
        button.title = '复制中文物品名称';

        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();

            if (button.disabled) return;

            const name = getChineseName(link);

            if (!name) return;

            button.disabled = true;

            const success = await copyText(name);

            button.dataset.copyState = success
                ? 'success'
                : 'error';

            button.textContent = success
                ? '✓ 已复制'
                : '复制失败';

            if (success) {
                showToast('已复制中文物品名称');
            } else {
                showToast('复制失败', false);
            }

            setTimeout(() => {
                button.textContent = '📋 复制';
                button.dataset.copyState = '';
                button.disabled = false;
            }, 1000);
        });

        return button;
    }

    function addNameCopyButton(container) {
        if (!container || container.querySelector(`.${BUTTON_CLASS}`)) {
            return;
        }

        const link = container.querySelector('a[class*="item-link"]');

        if (!link) return;

        const chineseName = getChineseName(link);

        if (!chineseName) return;

        const button = createCopyButton(link);

        link.insertAdjacentElement('afterend', button);
    }

    function processOrderItems() {
        document.querySelectorAll(
            '[class*="order-unit__item-name"]'
        ).forEach(addNameCopyButton);

        document.querySelectorAll(
            '[class*="order-own__item-name"]'
        ).forEach(addNameCopyButton);
    }

    function getAuctionType(auction) {
        const image = auction.querySelector(
            '.auction-entry__item-image'
        );

        const alt = (
            image?.getAttribute('alt') || ''
        ).trim().toLowerCase();

        switch (alt) {
            case 'riven mod':
                return 'Riven Mod';

            case 'kuva lich':
                return 'Kuva Lich';

            case 'sister of parvos':
                return 'Sister of Parvos';

            default:
                return '';
        }
    }

    function getAuctionInfo(auction) {
        const type = getAuctionType(auction);

        const username = getUsername(
            auction.querySelector('[class*="auction-entry__user"]')
        );

        const fallbackName = auction.querySelector(
            '.auction-entry__name a > span'
        );

        const itemName = getText(fallbackName);

        const buyoutElement = auction.querySelector(
            '.auction-entry__buyout'
        );

        const price = getPrice(buyoutElement);

        return {
            type,
            username,
            itemName,
            price
        };
    }

    function createAuctionButton(auction) {
        const button = document.createElement('button');

        button.type = 'button';

        button.className =
            'btn btn__light--c9XBJ expandable--HtjPs auction-entry__link-button ' +
            AUCTION_BUTTON_CLASS;

        button.innerHTML = `
            <div>
                <svg class="wfm-icon" viewBox="0 0 512 512" aria-hidden="true">
                    <use xlink:href="/static/build/resources/wfm-icons-e0dfe9.svg#icon-paste"></use>
                </svg>
                <span>复制购买指令</span>
            </div>
        `;

        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();

            const info = getAuctionInfo(auction);

            if (!info.type) {
                showToast('无法识别拍卖类型', false);

                console.warn(
                    '[Warframe Market] 未识别的拍卖类型：',
                    auction.querySelector(
                        '.auction-entry__item-image'
                    )?.getAttribute('alt')
                );

                return;
            }

            if (
                !info.username ||
                !info.itemName ||
                !info.price
            ) {
                showToast('无法读取卖家、物品名称或一口价', false);

                console.warn(
                    '[Warframe Market] 拍卖信息不完整：',
                    info
                );

                return;
            }

            const message =
                `/w ${info.username} Hi! I want to buy this ${info.type}: ` +
                `"${info.itemName}" for ${info.price} platinum. ` +
                `(warframe.market)`;

            const success = await copyText(message);

            if (success) {
                showToast(`已复制 ${info.type} 购买指令`);

                console.log(
                    '[Warframe Market] 拍卖购买指令：',
                    message
                );
            } else {
                showToast('复制失败，请检查浏览器权限', false);
            }
        });

        return button;
    }

    function processAuctions() {
        document.querySelectorAll('.auction-entry').forEach(auction => {
            const buttonsContainer = auction.querySelector(
                '.auction-entry__buttons'
            );

            if (!buttonsContainer) return;

            if (
                buttonsContainer.querySelector(
                    `.${AUCTION_BUTTON_CLASS}`
                )
            ) {
                return;
            }

            buttonsContainer.appendChild(
                createAuctionButton(auction)
            );
        });
    }

    function processPage() {
        processOrderItems();
        processAuctions();
    }

    let processTimer = null;

    const observer = new MutationObserver(() => {
        if (processTimer) return;

        processTimer = setTimeout(() => {
            processTimer = null;
            processPage();
        }, 100);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    const STYLE = `
        div[class*="order-unit__item-name"],
        div[class*="order-own__item-name"] {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 64px !important;
            align-items: center !important;
            column-gap: 8px !important;
            row-gap: 3px !important;
            width: 100% !important;
            min-width: 0 !important;
        }

        div[class*="order-unit__item-name"] a[class*="item-link"],
        div[class*="order-own__item-name"] a[class*="item-link"] {
            grid-column: 1 !important;
            grid-row: 1 !important;
            display: inline-flex !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
        }

        div[class*="order-unit__item-name"] span[class*="original-name"],
        div[class*="order-own__item-name"] span[class*="original-name"] {
            grid-column: 1 / -1 !important;
            grid-row: 2 !important;
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
        }

        .${BUTTON_CLASS} {
            grid-column: 2 !important;
            grid-row: 1 !important;

            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;

            box-sizing: border-box !important;
            width: 64px !important;
            min-width: 64px !important;
            max-width: 64px !important;
            height: 24px !important;

            margin: 0 !important;
            padding: 0 5px !important;

            background: #4786ff !important;
            color: #fff !important;
            border: none !important;
            border-radius: 4px !important;

            font-size: 12px !important;
            line-height: 1 !important;
            white-space: nowrap !important;

            cursor: pointer !important;
        }

        .${BUTTON_CLASS}:hover {
            background: #326fe0 !important;
        }

        .${BUTTON_CLASS}:disabled {
            opacity: .7 !important;
            cursor: default !important;
        }

        .${BUTTON_CLASS}[data-copy-state="success"] {
            background: #28a66a !important;
        }

        .${BUTTON_CLASS}[data-copy-state="error"] {
            background: #dc3545 !important;
        }

        .${AUCTION_BUTTON_CLASS} {
            cursor: pointer;
        }

        .row:has(.order-clipboard) {
            display: none !important;
        }

        #${TOAST_ID} {
            position: fixed;
            z-index: 999999;

            left: 50%;
            bottom: 35px;

            transform: translateX(-50%) translateY(10px);

            padding: 10px 18px;
            border-radius: 8px;

            background: rgba(35, 40, 48, .96);
            color: #fff;

            font-size: 13px;
            line-height: 1.5;

            box-shadow: 0 4px 18px rgba(0, 0, 0, .25);

            opacity: 0;
            pointer-events: none;

            transition:
                opacity .2s,
                transform .2s;
        }

        #${TOAST_ID}.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    `;

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');

        style.id = STYLE_ID;
        style.textContent = STYLE;

        (document.head || document.documentElement)
            .appendChild(style);
    }

    injectStyle();
    processPage();

    console.log(
        '✅ Warframe Market 快捷复制已加载'
    );

})();
