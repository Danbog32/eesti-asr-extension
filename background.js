// background.js (Manifest V3 service worker)
console.log("Background service worker loaded!");

// Simple event: click on the extension's toolbar icon
chrome.action.onClicked.addListener(() => {
  console.log("User clicked the extension icon, attempting to capture audio...");

  console.log("Checking chrome.tabCapture...", chrome.tabCapture);

  chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (chrome.runtime.lastError) {
      console.error("tabCapture error:", chrome.runtime.lastError);
      return;
    }
    if (!stream) {
      console.error("No stream returned. Possibly no active tab?");
      return;
    }
    console.log("Successfully captured tab audio:", stream);
  });
});
