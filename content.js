// Content Script - Toggle Tab with Dynamic Positioning
// サイドパネルAPI + トグルタブ（動的配置 + ドラッグ可能）

(function () {

    // 二重注入防止
    if (document.getElementById('sasatto-everytodo-toggle-tab')) {
        return;
    }

    // 設定: カスタマイズ可能
    const TAB_WIDTH = 32;
    const TAB_HEIGHT = 64;
    const TAB_SPACING = 8;
    const TAB_ICON = '✓';  // チェックマークアイコン
    const TAB_COLOR = '#ff7733';
    const TAB_HOVER_COLOR = '#ee6622';
    const TAB_DRAG_COLOR = '#dd5511';

    // 他の拡張機能のトグルタブを検出して、衝突しない位置を見つける
    function findAvailablePosition() {
        // 画面右端付近の要素を検索
        const allElements = document.querySelectorAll('*');
        const rightEdgeElements = Array.from(allElements).filter(el => {
            const rect = el.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(el);

            // 右端から50px以内、fixed positionの要素
            return computedStyle.position === 'fixed' &&
                   rect.right >= window.innerWidth - 50 &&
                   rect.width > 20 && rect.width < 100 &&
                   rect.height > 40 && rect.height < 150;
        });

        // 既存のタブの位置を取得
        const occupiedPositions = rightEdgeElements.map(el => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom };
        });


        // デフォルト位置（中央）から開始
        let topPosition = (window.innerHeight - TAB_HEIGHT) / 2;

        // 衝突チェック
        function isPositionAvailable(top) {
            const bottom = top + TAB_HEIGHT;
            return !occupiedPositions.some(pos => {
                return !(bottom + TAB_SPACING < pos.top || top - TAB_SPACING > pos.bottom);
            });
        }

        // 衝突する場合、下方向に探す
        if (!isPositionAvailable(topPosition)) {
            let offset = TAB_HEIGHT + TAB_SPACING;
            let attempts = 0;
            const maxAttempts = 10;

            while (!isPositionAvailable(topPosition) && attempts < maxAttempts) {
                // 下方向を試す
                topPosition = (window.innerHeight - TAB_HEIGHT) / 2 + offset;

                if (topPosition + TAB_HEIGHT > window.innerHeight - 20) {
                    // 画面外に出る場合、上方向を試す
                    topPosition = (window.innerHeight - TAB_HEIGHT) / 2 - offset;
                }

                offset += TAB_HEIGHT + TAB_SPACING;
                attempts++;
            }
        }

        // 画面内に収める
        topPosition = Math.max(20, Math.min(topPosition, window.innerHeight - TAB_HEIGHT - 20));

        return topPosition;
    }

    // トグルタブを作成
    async function createToggleTab() {
        // 保存された位置を取得
        const { tabPosition } = await chrome.storage.local.get('tabPosition');

        const toggleTab = document.createElement('div');
        toggleTab.id = 'sasatto-everytodo-toggle-tab';
        toggleTab.innerHTML = TAB_ICON;
        toggleTab.title = 'ささっとeverytodo（Shift+ドラッグで移動）';

        // 保存された位置がある場合はそれを使用、なければ動的配置
        const topPosition = tabPosition !== undefined ? tabPosition : findAvailablePosition();

        toggleTab.style.cssText = `
            position: fixed;
            top: ${topPosition}px;
            right: 0;
            width: ${TAB_WIDTH}px;
            height: ${TAB_HEIGHT}px;
            background: ${TAB_COLOR};
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 2147483647;
            border-radius: 8px 0 0 8px;
            font-size: 16px;
            box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
            transition: background 0.2s;
            user-select: none;
        `;

        toggleTab.addEventListener('mouseenter', () => {
            if (!isDragging) {
                toggleTab.style.background = TAB_HOVER_COLOR;
            }
        });

        toggleTab.addEventListener('mouseleave', () => {
            if (!isDragging) {
                toggleTab.style.background = TAB_COLOR;
            }
        });

        // トグルタブクリック時にサイドパネルをトグル（開閉切り替え）
        toggleTab.addEventListener('click', async (e) => {
            // ドラッグ中またはドラッグ直後はクリックイベントを無視
            if (isDragging || wasDragging) {
                wasDragging = false;
                return;
            }


            // 拡張機能コンテキストが有効かチェック
            if (!chrome.runtime?.id) {
                alert('拡張機能が更新されました。ページをリロードしてください。');
                return;
            }

            try {
                // サイドパネルが開いているかチェック
                const { sidePanelOpen } = await chrome.storage.local.get('sidePanelOpen');

                if (sidePanelOpen) {
                    // 開いている場合は閉じる
                    await chrome.runtime.sendMessage({ action: 'closeSidePanel' });
                } else {
                    // 閉じている場合は開く
                    await chrome.runtime.sendMessage({ action: 'openSidePanel' });
                }
            } catch (error) {
                // コンテキスト無効化エラーの場合
                if (error.message?.includes('Extension context invalidated')) {
                    alert('拡張機能が更新されました。ページをリロードしてください。');
                }
            }
        });

        document.body.appendChild(toggleTab);

        return toggleTab;
    }

    // ドラッグ可能機能
    let isDragging = false;
    let wasDragging = false;
    let dragStartY = 0;
    let tabStartTop = 0;

    function makeTabDraggable(toggleTab) {
        toggleTab.addEventListener('mousedown', (e) => {
            // Shiftキーを押しながらマウスダウンでドラッグモード
            if (e.shiftKey) {
                isDragging = true;
                wasDragging = false;
                dragStartY = e.clientY;
                tabStartTop = parseInt(toggleTab.style.top);
                toggleTab.style.cursor = 'grabbing';
                toggleTab.style.background = TAB_DRAG_COLOR;
                toggleTab.title = 'ドラッグ中...';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaY = e.clientY - dragStartY;
                let newTop = tabStartTop + deltaY;

                // 画面内に制限
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - TAB_HEIGHT));

                toggleTab.style.top = `${newTop}px`;
                wasDragging = true;
            }
        });

        document.addEventListener('mouseup', async () => {
            if (isDragging) {
                isDragging = false;
                toggleTab.style.cursor = 'pointer';
                toggleTab.style.background = TAB_COLOR;
                toggleTab.title = 'ささっとeverytodo（Shift+ドラッグで移動）';

                // 位置を保存
                const newTop = parseInt(toggleTab.style.top);
                await chrome.storage.local.set({ tabPosition: newTop });

                // クリックイベント防止のため、少し待つ
                setTimeout(() => {
                    wasDragging = false;
                }, 100);
            }
        });

        // 位置リセット機能（Shiftキー + ダブルクリック）
        let lastClickTime = 0;
        toggleTab.addEventListener('mousedown', async (e) => {
            if (e.shiftKey) {
                const now = Date.now();
                if (now - lastClickTime < 300) {
                    // ダブルクリック検出
                    const defaultPosition = findAvailablePosition();
                    toggleTab.style.top = `${defaultPosition}px`;
                    await chrome.storage.local.set({ tabPosition: defaultPosition });
                }
                lastClickTime = now;
            }
        });
    }

    // 初期化
    createToggleTab().then(toggleTab => {
        makeTabDraggable(toggleTab);

        // ウィンドウリサイズ時に位置を調整
        window.addEventListener('resize', () => {
            const currentTop = parseInt(toggleTab.style.top);
            const maxTop = window.innerHeight - TAB_HEIGHT;
            if (currentTop > maxTop) {
                toggleTab.style.top = `${maxTop}px`;
                chrome.storage.local.set({ tabPosition: maxTop });
            }
        });
    });
})();
