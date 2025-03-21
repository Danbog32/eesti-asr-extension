document.addEventListener("DOMContentLoaded", () => {
  // Get references to UI elements.
  const textSizeInput = document.getElementById("textSize");
  const lineHeightInput = document.getElementById("lineHeight");
  const bgColorInput = document.getElementById("bgColor");
  const textColorInput = document.getElementById("textColor");
  const startStopBtn = document.getElementById("startStopBtn");
  const stopBtn = document.getElementById("stopBtn"); // New Stop button
  const clearCaptionsBtn = document.getElementById("clearCaptionsBtn");

  // Local state for caption settings.
  let captionSettings = {
    textSize: parseFloat(textSizeInput.value),
    lineHeight: parseFloat(lineHeightInput.value),
    backgroundColor: bgColorInput.value,
    textColor: textColorInput.value,
  };

  // Helper: Send updated caption settings to the active tab.
  function sendCaptionUpdate() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "UPDATE_CAPTION_STYLES",
          settings: captionSettings,
        });
      }
    });
  }

  // Helper: Inject the content script then fetch the current caption styles.
  function fetchCurrentCaptionStyles() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabId = tabs[0].id;
        // Inject content.js (if not already injected).
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ["content.js"],
          },
          () => {
            // Now that content.js is injected, send the GET_CAPTION_STYLES message.
            chrome.tabs.sendMessage(
              tabId,
              { type: "GET_CAPTION_STYLES" },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "GET_CAPTION_STYLES error:",
                    chrome.runtime.lastError.message
                  );
                  return;
                }
                if (response) {
                  captionSettings = {
                    textSize: response.textSize,
                    lineHeight: response.lineHeight,
                    backgroundColor: response.backgroundColor,
                    textColor: response.textColor,
                  };
                  textSizeInput.value = captionSettings.textSize;
                  lineHeightInput.value = captionSettings.lineHeight;
                  bgColorInput.value = captionSettings.backgroundColor;
                  textColorInput.value = captionSettings.textColor;
                }
              }
            );
          }
        );
      }
    });
  }

  // Fetch caption styles on popup open.
  fetchCurrentCaptionStyles();

  // Update caption styles when inputs change.
  textSizeInput.addEventListener("input", (event) => {
    captionSettings.textSize = parseFloat(event.target.value);
    sendCaptionUpdate();
    console.log("Updated text size:", captionSettings.textSize);
  });
  lineHeightInput.addEventListener("input", (event) => {
    captionSettings.lineHeight = parseFloat(event.target.value);
    sendCaptionUpdate();
    console.log("Updated line height:", captionSettings.lineHeight);
  });
  bgColorInput.addEventListener("input", (event) => {
    captionSettings.backgroundColor = event.target.value;
    sendCaptionUpdate();
    console.log("Updated background color:", captionSettings.backgroundColor);
  });
  textColorInput.addEventListener("input", (event) => {
    captionSettings.textColor = event.target.value;
    sendCaptionUpdate();
    console.log("Updated text color:", captionSettings.textColor);
  });

  // --- Start Button Logic ---
  // When Start button is clicked, send the start message to background.
  startStopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { type: "START_RECORD_FROM_POPUP" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending start message to background:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Start message sent to background, response:", response);
        }
      }
    );
    console.log("Start button clicked");
  });

  // --- Stop Button Logic ---
  // When Stop button is clicked, send the stop message to background.
  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { type: "STOP_RECORD_FROM_POPUP" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending stop message to background:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Stop message sent to background, response:", response);
        }
      }
    );
    console.log("Stop button clicked");
  });

  // Clear Captions button: sends clear message to the active tab.
  clearCaptionsBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        // Send message to content script to clear visible captions
        chrome.tabs.sendMessage(tabs[0].id, { type: "CLEAR_CAPTIONS" });

        // Send message to background script to reset the recognizer
        chrome.runtime.sendMessage({ type: "RESET_RECOGNIZER" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending reset message to background:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log(
              "Reset message sent to background, response:",
              response
            );
          }
        });
        console.log("Clear Captions button clicked");
      }
    });
  });
});
