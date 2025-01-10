// app-asr.js

// Variables for ASR
let recognizer = null;
let recognizer_stream = null;
let expectedSampleRate = 16000;

// Initialize the ASR model
Module.onRuntimeInitialized = function () {
  console.log("ASR Model initialized!");

  recognizer = createOnlineRecognizer(Module);
  console.log("Recognizer created", recognizer);

  // Start processing audio
  processAudio();
};

let processingEnabled = true; // Flag to control processing

// Listen for messages from the content script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.action === "stopTranscription") {
    processingEnabled = false;
    // Clean up recognizer and stream
    if (recognizer_stream) {
      recognizer.deleteStream(recognizer_stream);
      recognizer_stream = null;
    }
    // Optionally, stop audio processing
    if (processor) {
      processor.disconnect();
    }
  }
});

// Audio processing function
function processAudio() {
  // const mediaElement = document.querySelector("video, audio");
  // if (!mediaElement) {
  //   console.error("No media element found on the page.");
  //   return;
  // }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const recordSampleRate = audioCtx.sampleRate;

  const mediaStream = audioCtx.createMediaElementSource(mediaElement);

  // Connect the mediaStream directly to the destination so the user can hear the audio
  mediaStream.connect(audioCtx.destination);

  // Create a processor node for transcription processing
  const bufferSize = 4096; // Adjust as needed for performance
  const numberOfInputChannels = 1;
  const numberOfOutputChannels = 1;

  const processor = audioCtx.createScriptProcessor(
    bufferSize,
    numberOfInputChannels,
    numberOfOutputChannels
  );

  // Connect the mediaStream to the processor node
  mediaStream.connect(processor);

  // To ensure the processor node processes the audio, we need to connect it to an output.
  // Since we don't want to output this audio, we can connect it to a GainNode with zero gain.
  const zeroGain = audioCtx.createGain();
  zeroGain.gain.value = 0;

  processor.connect(zeroGain);
  zeroGain.connect(audioCtx.destination);

  processor.onaudioprocess = function (e) {
    let inputBuffer = e.inputBuffer;

    // Get the input data from the input buffer
    let samples = new Float32Array(inputBuffer.getChannelData(0));
    samples = downsampleBuffer(samples, recordSampleRate, expectedSampleRate);

    if (!recognizer_stream) {
      recognizer_stream = recognizer.createStream();
    }

    recognizer_stream.acceptWaveform(expectedSampleRate, samples);
    while (recognizer.isReady(recognizer_stream)) {
      recognizer.decode(recognizer_stream);
    }

    let isEndpoint = recognizer.isEndpoint(recognizer_stream);
    let result = recognizer.getResult(recognizer_stream).text;

    if (result && result.length > 0) {
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
      recognizer.reset(recognizer_stream);
    }
  };
}

// Downsample buffer function remains unchanged
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) {
    return buffer;
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
