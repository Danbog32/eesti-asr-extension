document.addEventListener("DOMContentLoaded", () => {
  // Add this function at the beginning of your DOMContentLoaded event handler

  // Verify the actual transcription state when popup opens
  async function verifyTranscriptionState() {
    // Get the current transcription state and options tab ID
    chrome.storage.local.get(
      ["transcriptionState", "optionTabId"],
      async (result) => {
        const { transcriptionState, optionTabId } = result;

        // If state shows recording but no options tab exists, reset the state
        if (transcriptionState && optionTabId) {
          try {
            // Check if the tab actually exists
            await chrome.tabs.get(optionTabId);
            // If we get here, the tab exists, so state is valid
          } catch (error) {
            // Tab doesn't exist, so reset state through background
            console.log(
              "Options tab doesn't exist but state is recording; resetting"
            );
            chrome.runtime.sendMessage({ type: "RESET_TRANSCRIPTION_STATE" });
          }
        }
      }
    );
  }

  // Call this at the beginning of your popup.js DOMContentLoaded handler
  verifyTranscriptionState();

  // Get references to UI elements.
  const textSizeInput = document.getElementById("textSize");
  const lineHeightInput = document.getElementById("lineHeight");
  const textSizeValue = document.getElementById("textSizeValue");
  const lineHeightValue = document.getElementById("lineHeightValue");
  const bgColorInput = document.getElementById("bgColor");
  const textColorInput = document.getElementById("textColor");
  const toggleBtn = document.getElementById("toggleBtn"); // Single toggle button
  const clearCaptionsBtn = document.getElementById("clearCaptionsBtn");

  // Update the display value when sliders change
  textSizeInput.addEventListener("input", () => {
    textSizeValue.textContent = textSizeInput.value;
  });

  lineHeightInput.addEventListener("input", () => {
    lineHeightValue.textContent = lineHeightInput.value;
  });

  // Local state for caption settings.
  let captionSettings = {
    textSize: parseFloat(textSizeInput.value),
    lineHeight: parseFloat(lineHeightInput.value),
    backgroundColor: bgColorInput.value,
    textColor: textColorInput.value,
  };

  // Helper: Update toggle button appearance based on state
  function updateToggleButtonAppearance(isRecording) {
    const buttonText = toggleBtn.querySelector(".button-text");
    buttonText.textContent = isRecording ? "Peata" : "Alusta";

    if (isRecording) {
      // Red background for Stop state
      toggleBtn.classList.add("recording");
    } else {
      // Blue background for Start state
      toggleBtn.classList.remove("recording");
    }
  }

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
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ["content.js"],
          },
          () => {
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
                  textSizeValue.textContent = captionSettings.textSize;
                  lineHeightValue.textContent = captionSettings.lineHeight;
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

  // --- Toggle Button Logic ---
  // Update the button text based on the transcription state stored in chrome.storage.
  chrome.storage.local.get("transcriptionState", (result) => {
    updateToggleButtonAppearance(result.transcriptionState);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.transcriptionState) {
      updateToggleButtonAppearance(changes.transcriptionState.newValue);
    }
  });

  // When the toggle button is clicked, send a toggle message to background.
  toggleBtn.addEventListener("click", () => {
    // Disable the button to prevent multiple clicks while processing
    toggleBtn.disabled = true;

    chrome.runtime.sendMessage(
      { type: "TOGGLE_RECORD_FROM_POPUP" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending toggle message to background:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Toggle message sent to background, response:", response);
          // Update button text based on response
          if (response && response.status) {
            updateToggleButtonAppearance(response.status === "started");
          }
        }
        // Re-enable the button
        toggleBtn.disabled = false;
      }
    );
  });

  // Update the Clear Captions button handler
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
