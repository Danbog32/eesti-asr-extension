// contentScript.js

// We mimic the logic from content.js but adapt it to our own usage.

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

startTranscription();
let transcriptionContainer = null;
let textSpans = {}; // Will hold references to t0, t1, t2, t3

/**
 * Create the transcription element if it doesn't exist.
 */
function initElement() {
  if (document.getElementById("transcription")) {
    return;
  }

  // Create container
  transcriptionContainer = document.createElement("div");
  transcriptionContainer.id = "transcription";
  transcriptionContainer.style.cssText = `
    padding-top: 8px;
    font-size: 18px;
    position: fixed; 
    top: 85%; 
    left: 50%; 
    transform: translate(-50%, -50%);
    line-height: 18px;
    width: 400px;
    height: 60px;
    opacity: 0.9;
    z-index: 999999; 
    color: white;
    cursor: move;
  `;

  // Create 4 spans: t0, t1, t2, t3
  for (let i = 0; i < 4; i++) {
    let span = document.createElement("span");
    span.style.cssText = `
      position: absolute;
      background: black;
      padding-left: 8px;
      padding-right: 8px;
    `;
    span.id = "t" + i;

    // Hide t3 offscreen
    if (i === 3) {
      span.style.top = "-1000px";
    }

    transcriptionContainer.appendChild(span);
    textSpans["t" + i] = span;
  }

  document.body.appendChild(transcriptionContainer);

  // Make the container draggable
  makeElementDraggable(transcriptionContainer);
}

/**
 * Helper to make an element draggable (similar to your existing approach).
 */
function makeElementDraggable(elem) {
  let offsetX = 0, offsetY = 0, mouseX = 0, mouseY = 0;

  const mouseDownHandler = function (e) {
    e.preventDefault();
    mouseX = e.clientX;
    mouseY = e.clientY;

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
  };

  const mouseMoveHandler = function (e) {
    e.preventDefault();
    offsetX = e.clientX - mouseX;
    offsetY = e.clientY - mouseY;

    elem.style.top = elem.offsetTop + offsetY + "px";
    elem.style.left = elem.offsetLeft + offsetX + "px";

    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  const mouseUpHandler = function () {
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
  };

  elem.addEventListener("mousedown", mouseDownHandler);
}

/**
 * Cross-browser way to get computed style.
 */
function getStyle(el, styleProp) {
  const x = document.getElementById(el);
  if (!x) return null;

  if (x.currentStyle) {
    return x.currentStyle[styleProp];
  } else if (window.getComputedStyle) {
    return document.defaultView
      .getComputedStyle(x, null)
      .getPropertyValue(styleProp);
  }
  return null;
}

/**
 * Splits the text in `elem` into lines based on line-height.
 */
function getLines(elem, lineHeight) {
  const originalText = elem.innerHTML;
  const words = originalText.split(" ");
  const segments = [];

  let currentLines = 1;
  let segment = "";
  let segmentLen = 0;
  let divHeight = 0;

  for (let i = 0; i < words.length; i++) {
    segment += words[i] + " ";
    elem.innerHTML = segment;
    divHeight = elem.offsetHeight;

    // If adding this word created a new line
    if (divHeight / lineHeight > currentLines) {
      // This line excludes the last word that caused the break
      const lineSegment = segment.substring(
        segmentLen,
        segment.length - 1 - words[i].length - 1
      );
      segments.push(lineSegment);

      segmentLen += lineSegment.length + 1; // +1 for space
      currentLines++;
    }
  }

  // Last segment
  const lineSegment = segment.substring(segmentLen, segment.length - 1);
  segments.push(lineSegment);

  // Restore original text
  elem.innerHTML = originalText;
  return segments;
}

/**
 * Update the transcription lines (t0, t1, t2) from the incoming text,
 * similarly to content.js.
 */
function updateTranscription(text) {
  initElement(); // Ensure the container/spans are present

  // Put the entire text in t3 (offscreen)
  const elemT3 = textSpans["t3"];
  elemT3.innerHTML = text.replace(/(\r\n|\n|\r)/gm, "");

  // Get line-height from t3
  let lineHeightStyle = getStyle("t3", "line-height");
  if (!lineHeightStyle) {
    // Fallback if something's off
    lineHeightStyle = "18px";
  }
  const lineHeight = parseInt(lineHeightStyle.replace("px", ""));

  // Break text into lines
  const lines = getLines(elemT3, lineHeight);

  // Clear t3 now that we have lines
  elemT3.innerHTML = "";

  // Decide how many lines to show (e.g., 3)
  const linesToShow = 3;

  // Fill t0, t1, t2 with the last lines
  for (let i = 0; i < linesToShow; i++) {
    const span = textSpans["t" + i];
    // Clear everything first
    span.innerHTML = "";
  }

  if (lines.length <= linesToShow) {
    // If there's fewer lines than 3
    for (let i = 0; i < lines.length; i++) {
      textSpans["t" + i].innerHTML = lines[i];
    }
  } else {
    // Show only the last 3 lines
    for (let i = 0; i < linesToShow; i++) {
      textSpans["t" + i].innerHTML = lines[lines.length - linesToShow + i];
    }
  }

  // Position t1, t2 below t0, t1
  for (let i = 1; i < linesToShow; i++) {
    const prevSpan = textSpans["t" + (i - 1)];
    const currSpan = textSpans["t" + i];
    currSpan.style.top = prevSpan.offsetTop + prevSpan.offsetHeight + "px";
  }
}

// Example: Listen for transcription updates from the page context or your background script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.action === "transcriptionUpdate") {
    updateTranscription(event.data.text);
  }
});

// Optionally, if you use chrome.runtime messages, you could do:
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRANSCRIPTION_UPDATE") {
    updateTranscription(request.text);
  }
  sendResponse({ status: "ok" });
});
