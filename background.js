// background.js

let isEnabled = true; // Default state: enabled

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  // Toggle the enabled state
  isEnabled = !isEnabled;

  // Update the extension icon to reflect the state
  const iconPath = isEnabled
    ? {
        16: "icons/enabled_icon.svg",
        32: "icons/enabled_icon.svg",
        48: "icons/enabled_icon.svg",
        128: "icons/enabled_icon.svg",
      }
    : {
        16: "icons/disabled_icon.svg",
        32: "icons/disabled_icon.svg",
        48: "icons/disabled_icon.svg",
        128: "icons/disabled_icon.svg",
      };

  chrome.action.setIcon({ path: iconPath, tabId: tab.id });

  const title = isEnabled ? "Disable Transcription" : "Enable Transcription";
  chrome.action.setTitle({ title: title, tabId: tab.id });

  // Send a message to the content script to enable/disable transcription
  chrome.tabs.sendMessage(tab.id, { action: "toggleTranscription", isEnabled });
});
