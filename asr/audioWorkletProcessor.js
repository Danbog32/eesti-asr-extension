// audioWorkletProcessor.js

class ASRAudioWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super(options);
      // If you need any custom processorOptions passed from main, 
      // you can access them here: options.processorOptions
    }
  
    /**
     * @param inputs  [[[ Float32Array ]]] shape: [inputIndex][channelIndex][frameIndex]
     * @param outputs same shape if you choose to produce output
     * @returns {boolean} Return true to keep processing
     */
    process(inputs, outputs, parameters) {
      // We only expect 1 input (mono). If there's no input, return.
      if (!inputs[0] || !inputs[0][0]) {
        return true; 
      }
      const inputChannelData = inputs[0][0]; // Float32Array of samples for this block
  
      // Send samples to the main thread
      this.port.postMessage({
        audioData: inputChannelData
      });
  
      // We won't produce any audio output, so do nothing with outputs
      return true;
    }
  }
  
  // Register the processor under a chosen name
  registerProcessor("asr-audio-worklet", ASRAudioWorkletProcessor);
  