// Check if the script has already been loaded to prevent redeclarations
if (typeof window.captionScriptLoaded === "undefined") {
  // Mark this script as loaded
  window.captionScriptLoaded = true;

  // Declare all globals only once
  let transcriptionContainer = null;
  let textSpans = {}; // Will hold references to t0, t1, t2, t3

  // Global variable to hold the current caption settings.
  let currentCaptionSettings = {
    textSize: 1.8, // in rem
    lineHeight: 1.8, // in rem
    backgroundColor: "#000000", // default black in hex
    textColor: "#ffffff", // default white in hex
  };

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
   * Helper to make an element draggable.
   */
  function makeElementDraggable(elem) {
    let offsetX = 0,
      offsetY = 0,
      mouseX = 0,
      mouseY = 0;

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
   * Update the transcription lines (t0, t1, t2) from the incoming text.
   */
  function updateTranscription(text) {
    initElement(); // Ensure the container/spans are present

    // Put the entire text in t3 (offscreen)
    const elemT3 = textSpans["t3"];
    elemT3.innerHTML = text.replace(/(\r\n|\n|\r)/gm, "");

    // Get line-height from t3
    let lineHeightStyle = getStyle("t3", "line-height");
    if (!lineHeightStyle) {
      lineHeightStyle = "18px";
    }
    const lineHeight = parseInt(lineHeightStyle.replace("px", ""));

    // Break text into lines
    const lines = getLines(elemT3, lineHeight);

    // Clear t3 now that we have lines
    elemT3.innerHTML = "";

    // Decide how many lines to show (e.g., 3)
    const linesToShow = 3;

    // Clear t0, t1, t2 first
    for (let i = 0; i < linesToShow; i++) {
      const span = textSpans["t" + i];
      span.innerHTML = "";
    }

    if (lines.length <= linesToShow) {
      for (let i = 0; i < lines.length; i++) {
        textSpans["t" + i].innerHTML = lines[i];
      }
    } else {
      for (let i = 0; i < linesToShow; i++) {
        textSpans["t" + i].innerHTML = lines[lines.length - linesToShow + i];
      }
    }

    // Position subsequent spans below the previous ones
    for (let i = 1; i < linesToShow; i++) {
      const prevSpan = textSpans["t" + (i - 1)];
      const currSpan = textSpans["t" + i];
      currSpan.style.top = prevSpan.offsetTop + prevSpan.offsetHeight + "px";
    }
  }

  /**
   * Update caption styles based on user settings.
   * Expected settings format:
   * {
   *   textSize: number,         // in rem, between 1 and 8 (step 0.5)
   *   lineHeight: number,       // in rem, between 1 and 3 (step 0.2)
   *   backgroundColor: string,  // e.g., "#000000" (default black)
   *   textColor: string         // e.g., "#ffffff" (default white)
   * }
   */
  function updateCaptionStyles(settings) {
    // Ensure the caption element exists.
    initElement();

    // Apply defaults from our current state if a property is missing.
    const textSize =
      settings.textSize !== undefined
        ? settings.textSize
        : currentCaptionSettings.textSize;
    const lineHeight =
      settings.lineHeight !== undefined
        ? settings.lineHeight
        : currentCaptionSettings.lineHeight;
    const backgroundColor =
      settings.backgroundColor || currentCaptionSettings.backgroundColor;
    const textColor = settings.textColor || currentCaptionSettings.textColor;

    // Update our global state.
    currentCaptionSettings = {
      textSize,
      lineHeight,
      backgroundColor,
      textColor,
    };

    // Update all caption spans (t0, t1, t2, t3) with the new styles.
    Object.values(textSpans).forEach((span) => {
      span.style.fontSize = textSize + "rem";
      span.style.lineHeight = lineHeight + "rem";
      span.style.background = backgroundColor;
      span.style.color = textColor;
    });
  }

  /**
   * Clear all captions from all spans
   */
  function clearCaptions() {
    // Make sure the container and spans exist
    if (!document.getElementById("transcription")) {
      return;
    }

    // Loop over each span in textSpans and clear its content
    Object.values(textSpans).forEach((span) => {
      span.innerHTML = "";
    });

    console.log("Captions cleared");
  }

  // ------------------------
  // Message Listeners
  // ------------------------

  // Listen for messages from the page context or background script.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.action === "transcriptionUpdate") {
      updateTranscription(event.data.text);
    }
  });

  // Listen for chrome runtime messages.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ASR_RESULT") {
      updateTranscription(request.text);
    } else if (request.type === "UPDATE_CAPTION_STYLES") {
      // Update the caption styles with provided settings.
      updateCaptionStyles(request.settings);
    } else if (request.type === "GET_CAPTION_STYLES") {
      // Return the current settings.
      sendResponse({
        textSize: currentCaptionSettings.textSize,
        lineHeight: currentCaptionSettings.lineHeight,
        backgroundColor: currentCaptionSettings.backgroundColor,
        textColor: currentCaptionSettings.textColor,
      });
      return true;
    } else if (request.type === "CLEAR_CAPTIONS") {
      // Clear all captions
      clearCaptions();
    }
    sendResponse({ status: "ok" });
  });
}
