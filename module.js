var Module = {
  locateFile: function (file) {
    // Tells Emscripten where to fetch .wasm and .data
    return chrome.runtime.getURL("asr/" + file);
  },
  onRuntimeInitialized: function () {
    console.log("WASM Module is ready!");
    // If you want to create the recognizer right away, you can do it here.
    // e.g. recognizer = createOnlineRecognizer(Module);
  },
};
