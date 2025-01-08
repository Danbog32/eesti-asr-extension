// contentScript.js

// Start transcription
chrome.runtime.sendMessage({ action: "startTranscription" });

// Stop transcription example (uncomment if needed):
// chrome.runtime.sendMessage({ action: "stopTranscription" });

// Listen for transcripts from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TRANSCRIPTION_UPDATE") {
    console.log("Transcript:", msg.text);
    // Optionally update an overlay on the page:
    showTranscriptsOnPage(msg.text);
  }
});

function showTranscriptsOnPage(text) {
  let div = document.getElementById("myTranscriptDiv");
  if (!div) {
    div = document.createElement("div");
    div.id = "myTranscriptDiv";
    Object.assign(div.style, {
      position: "fixed",
      bottom: "10%",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "rgba(0,0,0,0.7)",
      color: "#fff",
      padding: "10px",
      zIndex: 999999
    });
    document.body.appendChild(div);
  }
  div.textContent = text;
}
