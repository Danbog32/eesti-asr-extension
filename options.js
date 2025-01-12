// merged-options-asr.js

// ------------------
// Utility functions
// ------------------
function tabCapture() {
  return new Promise((resolve) => {
    chrome.tabCapture.capture(
      {
        audio: true,
        video: false,
      },
      (stream) => {
        resolve(stream);
      }
    );
  });
}

function to16BitPCM(input) {
  const dataLength = input.length * (16 / 8);
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return dataView;
}

function to16kHz(audioData, sampleRate = 44100) {
  const data = new Float32Array(audioData);
  const fitCount = Math.round(data.length * (16000 / sampleRate));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1);
  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp);
    const after = Math.ceil(tmp);
    const atPoint = tmp - before;
    newData[i] = data[before] + (data[after] - data[before]) * atPoint;
  }
  newData[fitCount - 1] = data[data.length - 1];
  return newData;
}

function sendMessageToTab(tabId, data) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, data, (res) => {
      resolve(res);
    });
  });
}

// ------------------
// ASR Variables
// ------------------
let recognizer = null;
let recognizer_stream = null;
const EXPECTED_SAMPLE_RATE = 16000;

// Once the WASM module is ready
Module.onRuntimeInitialized = function () {
  console.log("ASR Model initialized!");
  recognizer = createOnlineRecognizer(Module); 
  console.log("Recognizer created", recognizer);
};

// ------------------
// startRecord using AudioWorklet
// ------------------
async function startRecord(option) {
  // 1) Capture tab audio
  const stream = await tabCapture();
  if (!stream) {
    console.warn("No active audio stream found. Closing option page...");
    window.close();
    return;
  }

  // If the tab closes, let's also close this
  stream.oninactive = () => {
    window.close();
  };

  // 2) Create an AudioContext
  const context = new AudioContext({ sampleRate: 44100 }); 
  // or default; you can also read actual .sampleRate

  // 3) Load our AudioWorkletProcessor
  await context.audioWorklet.addModule(chrome.runtime.getURL("asr/audioWorkletProcessor.js"));

  // 4) Create a MediaStreamAudioSourceNode from the captured stream
  const mediaStream = context.createMediaStreamSource(stream);

  // 5) Create an AudioWorkletNode using our "asr-audio-worklet" processor
  const audioWorkletNode = new AudioWorkletNode(context, "asr-audio-worklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1 // mono
  });

  // If you want to hear the tab’s audio, connect mediaStream to context.destination:
  mediaStream.connect(context.destination);

  // If you also want the worklet to feed something to the speakers, connect it:
  // audioWorkletNode.connect(context.destination);

  // 6) Connect: mediaStream -> worklet node
  mediaStream.connect(audioWorkletNode);

  // 7) When the processor posts audio data to port, handle it in the main thread
  audioWorkletNode.port.onmessage = async (event) => {
    if (!context || !recognizer) return;

    const { audioData } = event.data; 
    // `audioData` is a Float32Array of samples for this audio frame

    // Downsample from context.sampleRate (likely 44100) to 16000
    const output = to16kHz(audioData, context.sampleRate);
    // Convert to 16-bit PCM
    const audioData16 = to16BitPCM(output);

    // If your ASR library expects Float32 in 16k sample rate:
    const floatData = pcm16ToFloat32(audioData16);

    // 8) Push waveform into the Sherpa-ONNX ASR
    if (!recognizer_stream) {
      recognizer_stream = recognizer.createStream();
    }

    recognizer_stream.acceptWaveform(EXPECTED_SAMPLE_RATE, floatData);

    // Keep decoding while data is available
    while (recognizer.isReady(recognizer_stream)) {
      recognizer.decode(recognizer_stream);
    }

    let isEndpoint = recognizer.isEndpoint(recognizer_stream);
    let resultText = recognizer.getResult(recognizer_stream).text;

    if (resultText && resultText.length > 0) {
      // 9) Send partial or final transcription to content script
      await sendMessageToTab(option.currentTabId, {
        type: "ASR_RESULT",
        text: resultText,
      });
    }

    if (isEndpoint) {
      recognizer.reset(recognizer_stream);
    }
  };
}

// Utility: Convert PCM16 to Float32 for Sherpa Onnx
function pcm16ToFloat32(dataView) {
  const int16Array = new Int16Array(dataView.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    // 32768 = 2^15
    float32Array[i] = int16Array[i] / 32768;
  }
  return float32Array;
}

// ------------------
// Listen for messages (from Background)
// ------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, data } = request;
  switch (type) {
    case "START_RECORD":
      startRecord(data);
      break;
    default:
      break;
  }

  sendResponse({});
});
