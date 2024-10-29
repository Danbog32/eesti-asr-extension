class ASRProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 48000; // Adjust as needed
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferOffset = 0;
    this._logCounter = 0; // For controlled logging
  }

  process(inputs, outputs, parameters) {
    // Controlled logging to confirm the process method is called
    this._logCounter++;
    if (this._logCounter % 1000 === 0) {
      this.port.postMessage({ type: "log", message: "Process method called" });
    }

    const input = inputs[0];
    if (input && input.length > 0 && input[0].length > 0) {
      const channelData = input[0];
      const samplesToCopy = Math.min(
        channelData.length,
        this._bufferSize - this._bufferOffset
      );
      this._buffer.set(
        channelData.subarray(0, samplesToCopy),
        this._bufferOffset
      );
      this._bufferOffset += samplesToCopy;

      if (this._bufferOffset >= this._bufferSize) {
        // Send the audio data to the main thread
        this.port.postMessage(this._buffer.slice(0));
        this._bufferOffset = 0;
      }

      // Handle remaining samples
      if (channelData.length > samplesToCopy) {
        const remainingSamples = channelData.subarray(samplesToCopy);
        const remainingLength = remainingSamples.length;
        this._buffer.set(remainingSamples, this._bufferOffset);
        this._bufferOffset += remainingLength;
      }
    }

    return true;
  }
}

registerProcessor("asr-processor", ASRProcessor);
