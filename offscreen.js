// offscreen.js

let recognizer = null;
let recognizerStream = null;
let expectedSampleRate = 16000;
let audioCtx;
let processor;

/**
 * If you rely on the "Module" global from Sherpa-ONNX,
 * wait for its initialization
 */
Module.onRuntimeInitialized = function () {
  console.log("WASM module loaded in offscreen doc!");
  // Create the recognizer
  recognizer = createOnlineRecognizer(Module);
  console.log("Recognizer created:", recognizer);
};

// Listen for messages from the background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "offscreen-start-capture") {
    startCapture();
    sendResponse({ ok: true });
  } else if (msg.action === "offscreen-stop-capture") {
    stopCapture();
    sendResponse({ ok: true });
  }
});

// Start capturing tab audio and process with WASM-based ASR
function startCapture() {
  console.log("Offscreen: start capturing tab audio...");

  chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (chrome.runtime.lastError || !stream) {
      console.error("tabCapture error:", chrome.runtime.lastError);
      return;
    }
    console.log("Got tab audio stream in offscreen doc!");

    // Create an AudioContext
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const inputSampleRate = audioCtx.sampleRate;
    // Create a media source from the captured stream
    const source = audioCtx.createMediaStreamSource(stream);

    // ScriptProcessorNode (for older browsers)
    const bufferSize = 4096;
    processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

    source.connect(processor);
    // Must connect processor to an output or it won’t run
    const zeroGain = audioCtx.createGain();
    zeroGain.gain.value = 0;
    processor.connect(zeroGain);
    zeroGain.connect(audioCtx.destination);

    processor.onaudioprocess = (event) => {
      if (!recognizer) return; // not ready yet

      const inputBuffer = event.inputBuffer;
      let samples = new Float32Array(inputBuffer.getChannelData(0));
      samples = downsampleBuffer(samples, inputSampleRate, expectedSampleRate);

      if (!recognizerStream) {
        recognizerStream = recognizer.createStream();
      }

      recognizerStream.acceptWaveform(expectedSampleRate, samples);

      // Keep decoding while data is available
      while (recognizer.isReady(recognizerStream)) {
        recognizer.decode(recognizerStream);
      }

      const resultText = recognizer.getResult(recognizerStream).text;
      const isEndpoint = recognizer.isEndpoint(recognizerStream);

      if (resultText && resultText.length > 0) {
        // Send partial or final transcripts back to the background
        chrome.runtime.sendMessage({
          action: "transcriptionUpdate",
          text: resultText
        });
      }

      if (isEndpoint) {
        recognizer.reset(recognizerStream);
      }
    };
  });
}

// Stop capturing / processing
function stopCapture() {
  console.log("Offscreen: stop capturing audio.");
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (recognizerStream && recognizer) {
    recognizer.deleteStream(recognizerStream);
    recognizerStream = null;
  }
}

/**
 * Downsample from e.g. 48kHz to 16kHz
 */
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (sampleRate === outSampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}
