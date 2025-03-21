// merged-options-asr.js

// ------------------
// Global variables & state
// ------------------
let isRecording = false;
let _recordingContext = null;
let _mediaStream = null;
let _audioWorkletNode = null;
let recognizer = null;
let recognizer_stream = null;
const EXPECTED_SAMPLE_RATE = 16000;

// ------------------
// Utility functions
// ------------------
function tabCapture() {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (!stream) {
        reject(
          new Error(
            chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : "No active audio stream found. Please ensure you are on a supported page."
          )
        );
      } else {
        resolve(stream);
      }
    });
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

function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

// ------------------
// Recognizer Initialization
// ------------------
Module.onRuntimeInitialized = function () {
  console.log("ASR Model initialized!");
  recognizer = createOnlineRecognizer(Module);
  console.log("Recognizer created", recognizer);
};

// ------------------
// Recording Functions
// ------------------
async function startRecord(option) {
  if (!option || !option.currentTabId) {
    option = { currentTabId: await getStorage("currentTabId") };
  }

  let stream;
  try {
    stream = await tabCapture();
  } catch (err) {
    console.error("Error capturing tab:", err.message);
    document.body.innerHTML = `<h2>Error:</h2><p>${err.message}</p><p>Please navigate to a supported page and try again.</p>`;
    return;
  }

  if (!stream) {
    console.warn(
      "No active audio stream found. Please ensure you are on a supported page."
    );
    document.body.innerHTML = `<h2>Error:</h2><p>No active audio stream found. Please ensure you are on a supported page.</p>`;
    return;
  }

  _mediaStream = stream;
  stream.oninactive = () => {
    // console.warn("Stream became inactive.");
  };

  _recordingContext = new AudioContext({ sampleRate: 44100 });
  await _recordingContext.audioWorklet.addModule(
    chrome.runtime.getURL("asr/audioWorkletProcessor.js")
  );

  const mediaStreamSource = _recordingContext.createMediaStreamSource(stream);
  _audioWorkletNode = new AudioWorkletNode(
    _recordingContext,
    "asr-audio-worklet",
    {
      processorOptions: { inputSampleRate: _recordingContext.sampleRate },
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    }
  );

  mediaStreamSource.connect(_recordingContext.destination);
  mediaStreamSource.connect(_audioWorkletNode);

  _audioWorkletNode.port.onmessage = async (event) => {
    if (!recognizer) return;
    const { audioData } = event.data;
    if (!recognizer_stream) {
      recognizer_stream = recognizer.createStream();
    }
    recognizer_stream.acceptWaveform(EXPECTED_SAMPLE_RATE, audioData);
    while (recognizer.isReady(recognizer_stream)) {
      recognizer.decode(recognizer_stream);
    }
    const isEndpoint = recognizer.isEndpoint(recognizer_stream);
    const resultText = recognizer.getResult(recognizer_stream).text;
    if (resultText && resultText.length > 0) {
      await sendMessageToTab(option.currentTabId, {
        type: "ASR_RESULT",
        text: resultText,
      });
    }
    if (isEndpoint) {
      recognizer.reset(recognizer_stream);
    }
  };

  isRecording = true;
  chrome.storage.local.set({ transcriptionState: true });
  console.log("Transcription started.");
}

async function stopRecord() {
  if (_mediaStream) {
    _mediaStream.getTracks().forEach((track) => track.stop());
    _mediaStream = null;
  }
  if (_audioWorkletNode) {
    _audioWorkletNode.disconnect();
    _audioWorkletNode = null;
  }
  if (_recordingContext) {
    await _recordingContext.close();
    _recordingContext = null;
  }
  recognizer_stream = null;
  isRecording = false;
  chrome.storage.local.set({ transcriptionState: false });
  console.log("Transcription stopped.");
}

// Add a function to reset the recognizer stream
function resetRecognizerStream() {
  if (recognizer && recognizer_stream) {
    recognizer.reset(recognizer_stream);
    recognizer_stream = null;
    console.log("Recognizer stream reset.");
  }
}

// ------------------
// Message Listener
// ------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, data } = request;
  switch (type) {
    case "START_RECORD":
      if (!isRecording) {
        startRecord(data);
      }
      break;
    case "STOP_RECORD":
      if (isRecording) {
        stopRecord();
      }
      break;
    case "RESET_RECOGNIZER":
      resetRecognizerStream();
      break;
    default:
      break;
  }
  sendResponse({});
});
