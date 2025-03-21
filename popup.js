document.addEventListener("DOMContentLoaded", () => {
  // Get references to UI elements
  const textSizeInput = document.getElementById("textSize");
  const lineHeightInput = document.getElementById("lineHeight");
  const bgColorInput = document.getElementById("bgColor");
  const textColorInput = document.getElementById("textColor");
  const startStopBtn = document.getElementById("startStopBtn");
  const clearCaptionsBtn = document.getElementById("clearCaptionsBtn");

  // Local state for caption settings.
  let captionSettings = {
    textSize: parseFloat(textSizeInput.value),
    lineHeight: parseFloat(lineHeightInput.value),
    backgroundColor: bgColorInput.value,
    textColor: textColorInput.value,
  };

  // Helper: Send updated caption settings to the content script in the active tab.
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

  // Helper: Fetch the current caption styles from the active tab.
  function fetchCurrentCaptionStyles() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "GET_CAPTION_STYLES" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError.message);
              return;
            }
            if (response) {
              // Update local state with the response.
              captionSettings = {
                textSize: response.textSize,
                lineHeight: response.lineHeight,
                backgroundColor: response.backgroundColor,
                textColor: response.textColor,
              };

              // Update the UI controls with the current values.
              textSizeInput.value = captionSettings.textSize;
              lineHeightInput.value = captionSettings.lineHeight;
              bgColorInput.value = captionSettings.backgroundColor;
              textColorInput.value = captionSettings.textColor;
            }
          }
        );
      }
    });
  }

  // Fetch the current caption styles when the popup opens.
  fetchCurrentCaptionStyles();

  // Update caption text size when changed.
  textSizeInput.addEventListener("input", (event) => {
    captionSettings.textSize = parseFloat(event.target.value);
    sendCaptionUpdate();
    console.log("Update text size:", captionSettings.textSize);
  });

  // Update caption line height when changed.
  lineHeightInput.addEventListener("input", (event) => {
    captionSettings.lineHeight = parseFloat(event.target.value);
    sendCaptionUpdate();
    console.log("Update line height:", captionSettings.lineHeight);
  });

  // Update background color when changed.
  bgColorInput.addEventListener("input", (event) => {
    captionSettings.backgroundColor = event.target.value;
    sendCaptionUpdate();
    console.log("Update background color:", captionSettings.backgroundColor);
  });

  // Update text color when changed.
  textColorInput.addEventListener("input", (event) => {
    captionSettings.textColor = event.target.value;
    sendCaptionUpdate();
    console.log("Update text color:", captionSettings.textColor);
  });

  // --- Start/Stop Button Logic ---

  // When the popup opens, update the button text based on the current transcription state.
  chrome.storage.local.get("transcriptionState", (result) => {
    const isRecording = result.transcriptionState;
    startStopBtn.textContent = isRecording ? "Stop" : "Start";
  });

  // Listen for changes to transcriptionState in storage.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.transcriptionState) {
      const newState = changes.transcriptionState.newValue;
      startStopBtn.textContent = newState ? "Stop" : "Start";
    }
  });

  // Helper: Send the toggle message to the options tab.
  const sendToggleMessage = (optionTabId) => {
    chrome.tabs.sendMessage(
      optionTabId,
      { type: "TOGGLE_TRANSCRIPTION" },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending toggle:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Toggle message sent to options tab", optionTabId);
        }
      }
    );
  };

  // When Start/Stop button is clicked, send the toggle message to the options (recording) tab.
  startStopBtn.addEventListener("click", () => {
    chrome.storage.local.get("optionTabId", (result) => {
      let optionTabId = result.optionTabId;
      if (optionTabId) {
        // Try sending the toggle message.
        chrome.tabs.sendMessage(
          optionTabId,
          { type: "TOGGLE_TRANSCRIPTION" },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Sending toggle failed:",
                chrome.runtime.lastError.message
              );
              // If failed, ask background to reopen the options tab.
              chrome.runtime.sendMessage(
                { type: "OPEN_OPTIONS_TAB" },
                (res) => {
                  if (res && res.optionTabId) {
                    sendToggleMessage(res.optionTabId);
                  }
                }
              );
            }
          }
        );
      } else {
        // If no option tab is stored, ask background to open it.
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_TAB" }, (res) => {
          if (res && res.optionTabId) {
            sendToggleMessage(res.optionTabId);
          }
        });
      }
    });
    console.log("Start/Stop button clicked");
  });

  // Clear Captions button: clears the displayed captions (sent to the active tab).
  clearCaptionsBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "CLEAR_CAPTIONS" });
        console.log("Clear Captions button clicked");
      }
    });
  });
});
