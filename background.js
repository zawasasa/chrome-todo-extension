// サイドパネルを有効化
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// アクションボタンクリック時にサイドパネルを開く
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id })
})

// メッセージハンドラ（トグルタブからのメッセージを処理）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'openSidePanel') {
    // サイドパネルを開く
    (async () => {
      try {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 非同期レスポンスを示す
  } else if (message.action === 'closeSidePanel') {
    // サイドパネルを閉じる（タイムスタンプ方式）
    (async () => {
      try {
        await chrome.storage.local.set({
          sidePanelOpen: false,
          shouldCloseSidePanel: Date.now() // タイムスタンプで確実にイベント発火
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 非同期レスポンスを示す
  }
})