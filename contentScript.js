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
    overlay.style.position = "fixed";
    overlay.style.bottom = "10px";
    overlay.style.right = "10px";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    overlay.style.color = "#fff";
    overlay.style.padding = "10px";
    overlay.style.borderRadius = "5px";
    overlay.style.zIndex = "9999";
    overlay.style.fontSize = "14px";
    overlay.style.maxWidth = "300px";
    overlay.style.maxHeight = "200px";
    overlay.style.overflowY = "auto";
    document.body.appendChild(overlay);
  }
  overlay.textContent = text;
}
