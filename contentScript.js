// contentScript.js

let transcriptionEnabled = true; // Default state

function injectScript(filePath, callback) {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(filePath);
  script.onload = function () {
    this.remove();
    if (callback) callback();
  };
  script.onerror = function () {
    console.error(`Failed to inject script: ${filePath}`);
  };
  (document.head || document.documentElement).appendChild(script);
}

// Function to start transcription
function startTranscription() {
  // Inject ASR scripts and app-asr.js in sequence
  injectScript("asr/sherpa-onnx-wasm-main-asr.js", function () {
    injectScript("asr/sherpa-onnx-asr.js", function () {
      injectScript("asr/app-asr.js");
    });
  });
}

// Function to stop transcription
function stopTranscription() {
  // Remove the transcription overlay if it exists
  let overlay = document.getElementById("asr-transcription-overlay");
  if (overlay) {
    overlay.remove();
  }
  // Send a message to the injected script to stop processing
  window.postMessage({ action: "stopTranscription" }, "*");
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleTranscription") {
    transcriptionEnabled = request.isEnabled;
    if (transcriptionEnabled) {
      startTranscription();
    } else {
      stopTranscription();
    }
  }
});

// Initially start transcription
startTranscription();

// Store the caption lines
let captionLines = [];

// Timeout IDs for each line
let captionTimeoutIds = [];

// Listen for transcription updates from the page context
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (
    event.data &&
    event.data.action === "transcriptionUpdate" &&
    transcriptionEnabled
  ) {
    const { text, isFinal } = event.data;
    updateTranscriptionOverlay(text, isFinal);
  }
});

// Function to update or create the transcription overlay
function updateTranscriptionOverlay(text, isFinal) {
  let overlay = document.getElementById("asr-transcription-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "asr-transcription-overlay";

    // Apply initial styles
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "10%",
      width: "100%",
      textAlign: "center",
      color: "#fff",
      fontSize: "22px",
      zIndex: "9999",
      textShadow: "2px 2px 4px #000",
      pointerEvents: "none", // Allow clicks through the overlay
    });

    document.body.appendChild(overlay);
  }

  // Handle the text and lines
  if (isFinal) {
    // Start a new line with the final text
    captionLines.push(text.trim());

    // Limit to two lines
    if (captionLines.length > 2) {
      captionLines.shift(); // Remove the oldest line
    }

    // Update the overlay text
    overlay.innerHTML = captionLines.join("<br>");

    // Set a timeout to remove this line after a duration
    const lineIndex = captionLines.length - 1;
    const timeoutId = setTimeout(() => {
      // Remove the line after the duration
      captionLines.splice(lineIndex, 1);

      // Update the overlay or remove it if no lines are left
      if (captionLines.length === 0) {
        overlay.textContent = "";
      } else {
        overlay.innerHTML = captionLines.join("<br>");
      }
    }, 3000); // Display each line for 3 seconds

    // Store the timeout ID
    captionTimeoutIds.push(timeoutId);

    // If more than two timeouts exist, clear the oldest one
    if (captionTimeoutIds.length > 2) {
      clearTimeout(captionTimeoutIds.shift());
    }
  } else {
    // Update the last line with partial text
    if (captionLines.length === 0) {
      captionLines.push(text.trim());
    } else {
      captionLines[captionLines.length - 1] = text.trim();
    }

    // Update the overlay text
    overlay.innerHTML = captionLines.join("<br>");
  }
}
