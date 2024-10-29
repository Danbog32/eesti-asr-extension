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

// Inject ASR scripts and app-asr.js in sequence
injectScript("asr/sherpa-onnx-wasm-main-asr.js", function () {
  injectScript("asr/sherpa-onnx-asr.js", function () {
    injectScript("asr/app-asr.js");
  });
});

// Listen for transcription updates from the page context
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.action === "transcriptionUpdate") {
    updateTranscriptionOverlay(event.data.text);
  }
});

// Function to update or create the transcription overlay
function updateTranscriptionOverlay(text) {
  let overlay = document.getElementById("asr-transcription-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "asr-transcription-overlay";

    // Apply initial styles
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "10px",
      right: "10px",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: "#fff",
      padding: "10px",
      borderRadius: "5px",
      zIndex: "9999",
      fontSize: "14px",
      maxWidth: "300px",
      maxHeight: "200px",
      overflowY: "auto",
      cursor: "move", // Change cursor to indicate draggable
    });

    // Make the overlay draggable
    makeElementDraggable(overlay);

    document.body.appendChild(overlay);
  }

  overlay.textContent = text;
}

// Helper function to make an element draggable
function makeElementDraggable(elmnt) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  // Add mousedown listener to the overlay to initiate dragging
  elmnt.addEventListener("mousedown", dragMouseDown);

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();

    // Get the initial mouse cursor position
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Add event listeners for mousemove and mouseup to the document
    document.addEventListener("mousemove", elementDrag);
    document.addEventListener("mouseup", closeDragElement);
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Set the element's new position
    elmnt.style.top = elmnt.offsetTop - pos2 + "px";
    elmnt.style.left = elmnt.offsetLeft - pos1 + "px";
    elmnt.style.bottom = "auto"; // Reset bottom and right to allow free movement
    elmnt.style.right = "auto";
  }

  function closeDragElement() {
    // Remove the event listeners when dragging is finished
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", closeDragElement);
  }
}
