// app-asr.js

// Variables for ASR
let recognizer = null;
let recognizer_stream = null;
let expectedSampleRate = 16000;

// Initialize the ASR model
Module.onRuntimeInitialized = async function () {
  console.log("ASR Model initialized!");

  recognizer = createOnlineRecognizer(Module);
  console.log("Recognizer created", recognizer);

  // Start processing audio
  await processAudio();
};

async function processAudio() {
  const mediaElement = document.querySelector("video, audio");
  if (!mediaElement) {
    console.error("No media element found on the page.");
    return;
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const sampleRate = audioCtx.sampleRate;
  console.log("Audio context sample rate:", sampleRate);

  // Load the AudioWorklet module
  const scriptUrl = document.currentScript.src;
  const scriptDir = scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1);
  const asrProcessorUrl = scriptDir + "asr-processor.js";

  await audioCtx.audioWorklet.addModule(asrProcessorUrl).catch((error) => {
    console.error("Error loading asr-processor.js:", error);
  });

  const asrNode = new AudioWorkletNode(audioCtx, "asr-processor");

  asrNode.port.onmessage = function (event) {
    const data = event.data;
    if (data.type === "log") {
      console.log("Processor Log:", data.message);
    } else if (data instanceof Float32Array || Array.isArray(data)) {
      console.log("Received audio data from AudioWorkletProcessor");
      handleAudioSamples(data, sampleRate);
    } else {
      console.warn("Unknown message from processor:", data);
    }
  };

  const mediaStream = audioCtx.createMediaElementSource(mediaElement);

  // Create a silent gain node to prevent audio output from asrNode
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;

  // Connect the nodes properly
  mediaStream.connect(asrNode);
  asrNode.connect(silentGain);
  silentGain.connect(audioCtx.destination);
  mediaStream.connect(audioCtx.destination);

  // Ensure the media element is playing
  if (mediaElement.paused) {
    mediaElement.play().catch((error) => {
      console.error("Failed to play media element:", error);
    });
  }
}

function handleAudioSamples(samples, sampleRate) {
  console.log("Handling audio samples of length:", samples.length);
  if (!recognizer_stream) {
    recognizer_stream = recognizer.createStream();
  }

  // Downsample if necessary
  const downsampledSamples = downsampleBuffer(
    samples,
    sampleRate,
    expectedSampleRate
  );
  console.log("Downsampled samples length:", downsampledSamples.length);

  try {
    recognizer_stream.acceptWaveform(expectedSampleRate, downsampledSamples);
  } catch (e) {
    console.error("Error in acceptWaveform:", e);
  }

  console.log("Accepted waveform into recognizer");

  while (recognizer.isReady(recognizer_stream)) {
    console.log("Recognizer is ready, decoding...");
    recognizer.decode(recognizer_stream);
  }

  let isEndpoint = recognizer.isEndpoint(recognizer_stream);
  let result = recognizer.getResult(recognizer_stream).text;
  console.log("Recognizer result:", result);

  if (result && result.length > 0) {
    console.log("Transcription result:", result);
    // Send transcription to content script via window.postMessage
    window.postMessage(
      {
        action: "transcriptionUpdate",
        text: result,
      },
      "*"
    );
  }

  if (isEndpoint) {
    console.log("Recognizer reached endpoint, resetting stream.");
    recognizer.reset(recognizer_stream);
  }
}

// Downsample buffer function remains unchanged
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) {
    return new Float32Array(buffer);
  }
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0,
      count = 0;
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
