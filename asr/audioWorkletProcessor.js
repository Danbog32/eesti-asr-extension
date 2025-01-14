// audioWorkletProcessor.js
  class ASRAudioWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super(options);
  
      // Input sampling rate from main (e.g. 44100)
      this.inputSampleRate = options.processorOptions?.inputSampleRate || 44100;
  
      // We'll accumulate data in blocks; for example, 256 frames
      this.bufferSize = 512;
      // Our "accumulator" is a single Float32Array index
      this.offset = 0;
  
      // 1) Create a small pool of buffers
      this.poolSize = 8; // number of buffers to keep in the pool
      this.freeBuffers = [];
      this.inUseBuffers = new Set();
  
      for (let i = 0; i < this.poolSize; i++) {
        this.freeBuffers.push(new Float32Array(this.bufferSize));
      }
  
      // The "active" buffer we fill
      this.currentBuffer = this.getFreeBuffer();
      this.offset = 0;
    }
  
    // Grab a free buffer or create a new one if pool is empty
    getFreeBuffer() {
      if (this.freeBuffers.length > 0) {
        const buffer = this.freeBuffers.pop();
        this.inUseBuffers.add(buffer);
        return buffer;
      } else {
        // Pool exhausted; either create a new one or wait
        const buffer = new Float32Array(this.bufferSize);
        this.inUseBuffers.add(buffer);
        return buffer;
      }
    }
  
    // Mark a buffer as free to reuse
    freeBuffer(buf) {
      this.inUseBuffers.delete(buf);
      this.freeBuffers.push(buf);
    }
  
    // -----------------------
    // Utility: Downsample from e.g. 44.1 kHz to 16 kHz
    // -----------------------
    static to16kHz(float32Data, inputSampleRate = 44100) {
        const fitCount = Math.round(float32Data.length * (16000 / inputSampleRate));
        const resampled = new Float32Array(fitCount);
        const springFactor = (float32Data.length - 1) / (fitCount - 1);
    
        resampled[0] = float32Data[0];
        for (let i = 1; i < fitCount - 1; i++) {
          const tmp = i * springFactor;
          const before = Math.floor(tmp);
          const after = Math.ceil(tmp);
          const atPoint = tmp - before;
          resampled[i] = float32Data[before] + (float32Data[after] - float32Data[before]) * atPoint;
        }
        resampled[fitCount - 1] = float32Data[float32Data.length - 1];
        return resampled;
      }
    
      // -----------------------
      // Utility: Convert Float32 to 16-bit PCM
      // -----------------------
      static to16BitPCM(float32Data) {
        const dataBuffer = new ArrayBuffer(float32Data.length * 2);
        const dataView = new DataView(dataBuffer);
        let offset = 0;
        for (let i = 0; i < float32Data.length; i++, offset += 2) {
          const s = Math.max(-1, Math.min(1, float32Data[i]));
          // 0x8000 is 32768
          dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return dataView;
      }
    
      // -----------------------
      // Utility: Convert 16-bit PCM to Float32
      // -----------------------
      static pcm16ToFloat32(dataView) {
        const int16Array = new Int16Array(dataView.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }
        return float32Array;
      }
  
    process(inputs, outputs) {
      const input = inputs[0];
      if (!input || !input[0]) {
        return true;
      }
      const frame = input[0]; // e.g., 128-512 samples at 44.1 kHz
  
      // 1) Downsample => 16 kHz
      const downsampled = ASRAudioWorkletProcessor.to16kHz(frame, this.inputSampleRate);
  
      // 2) Convert => 16-bit
      const pcm16 = ASRAudioWorkletProcessor.to16BitPCM(downsampled);
  
      // 3) Convert => 16 kHz Float32
      const float32Data = ASRAudioWorkletProcessor.pcm16ToFloat32(pcm16);
  
      // 4) Copy into currentBuffer
      for (let i = 0; i < float32Data.length; i++) {
        this.currentBuffer[this.offset++] = float32Data[i];
  
        if (this.offset >= this.bufferSize) {
          // flush + get a new buffer
          this.flush();
          this.currentBuffer = this.getFreeBuffer();
          this.offset = 0;
        }
      }
  
      return true;
    }
  
    flush() {
      if (this.offset > 0) {
        // We'll post the portion that was used
        const usedPortion = this.currentBuffer.slice(0, this.offset);
  
        // Post this usedPortion to main thread
        // NOTE: we do not 'transfer' the underlying buffer here
        // because we still want to keep reusing this.currentBuffer
        this.port.postMessage({ audioData: usedPortion });
      }
      // We're done reading from `currentBuffer`, so we can reuse it
      this.freeBuffer(this.currentBuffer);
    }
  }
  
  registerProcessor("asr-audio-worklet", ASRAudioWorkletProcessor);
  