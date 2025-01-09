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

// Listen for transcription updates from the page context
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (
    event.data &&
    event.data.action === "transcriptionUpdate" &&
    transcriptionEnabled
  ) {
    updateTranscriptionOverlay(event.data.text);
  }
});

// Helper function to make an element draggable
function makeElementDraggable(elmnt) {
  // Existing draggable code
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  elmnt.addEventListener("mousedown", dragMouseDown);

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();

    pos3 = e.clientX;
    pos4 = e.clientY;

    document.addEventListener("mousemove", elementDrag);
    document.addEventListener("mouseup", closeDragElement);
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    elmnt.style.top = elmnt.offsetTop - pos2 + "px";
    elmnt.style.left = elmnt.offsetLeft - pos1 + "px";
    elmnt.style.bottom = "auto";
    elmnt.style.right = "auto";
  }

  function closeDragElement() {
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", closeDragElement);
  }
}

// Function to update or create the transcription overlay
function updateTranscriptionOverlay(text) {
  let overlay = document.getElementById("asr-transcription-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "asr-transcription-overlay";

    // Apply initial styles
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "15%",
      right: "50%",
      transform: "translateX(50%)",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: "#fff",
      padding: "10px",
      borderRadius: "5px",
      zIndex: "9999",
      fontSize: "22px",
      maxWidth: "300px",
      maxHeight: "200px",
      overflowY: "hidden",
      cursor: "move", // Change cursor to indicate draggable
    });

    // Make the overlay draggable
    makeElementDraggable(overlay);

    document.body.appendChild(overlay);
  }

  // Initialize last displayed text if it doesn't exist
  if (typeof window.lastDisplayedText === "undefined") {
    window.lastDisplayedText = "";
  }

  // Trim the text
  let newText = text.trim();

  // If the new text is the same as the last displayed text, do nothing
  if (newText === window.lastDisplayedText) {
    return;
  }

  // If the new text is shorter than the last displayed text, ASR might have reset
  if (newText.length < window.lastDisplayedText.length) {
    overlay.innerHTML = ""; // Clear existing content
  }

  // Update the last displayed text
  window.lastDisplayedText = newText;

  // Split the text into words
  let words = newText.split(/\s+/);

  // Decide how many words per line
  const wordsPerLine = 5;

  // Break the words into lines
  let lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    let line = words.slice(i, i + wordsPerLine).join(" ");
    lines.push(line);
  }

  // Keep only the last two lines
  if (lines.length > 2) {
    lines = lines.slice(-2);
  }

  // Update the overlay content
  overlay.innerHTML = ""; // Clear existing content

  lines.forEach((line) => {
    let captionElement = document.createElement("div");
    captionElement.textContent = line;
    overlay.appendChild(captionElement);
  });
}