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
  const stream = await tabCapture();
  if (!stream) {
    console.warn("No active audio stream found. Closing option page...");
    window.close();
    return;
  }

  stream.oninactive = () => window.close();

  const context = new AudioContext({ sampleRate: 44100 });

  // 1) Load the audio worklet
  await context.audioWorklet.addModule(chrome.runtime.getURL("asr/audioWorkletProcessor.js"));

  // 2) Create a source node from the captured stream
  const mediaStream = context.createMediaStreamSource(stream);

  // 3) Create the AudioWorkletNode
  const audioWorkletNode = new AudioWorkletNode(context, "asr-audio-worklet", {
    processorOptions: {
      inputSampleRate: context.sampleRate
    },
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1
  });

  // Optional: send audio to your speakers
  mediaStream.connect(context.destination);

  // Connect the chain: mediaStream -> worklet
  mediaStream.connect(audioWorkletNode);

  // 4) The worklet now sends final 16 kHz Float32 buffers via port messages
  audioWorkletNode.port.onmessage = async (event) => {
    if (!recognizer) return;

    const { audioData } = event.data; 
    // `audioData` is already a Float32Array at 16 kHz

    // Pass it to the ASR
    if (!recognizer_stream) {
      recognizer_stream = recognizer.createStream();
    }
    recognizer_stream.acceptWaveform(EXPECTED_SAMPLE_RATE, audioData);

    // Decode while ready
    while (recognizer.isReady(recognizer_stream)) {
      recognizer.decode(recognizer_stream);
    }

    const isEndpoint = recognizer.isEndpoint(recognizer_stream);
    const resultText = recognizer.getResult(recognizer_stream).text;

    if (resultText && resultText.length > 0) {
      // Send transcription to tab
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
