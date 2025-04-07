# Estonian ASR Extension - Captions Generator

## Overview

Estonian ASR is a browser extension that provides real-time Estonian language captions for audio and video content in your browser. The extension transcribes audio directly within the browser using a WebAssembly-based speech recognition engine, ensuring complete privacy by processing all audio locally without sending data to external servers.

## Features

- **Real-time Estonian Transcription**: Automatically generates Estonian subtitles for any audio playing in your browser tabs
- **Privacy-focused**: All audio processing happens locally in your browser - no data is sent to external servers
- **Customizable Captions**: Adjust text size, line height, background color, and text color
- **Movable Caption Display**: Drag and position captions anywhere on the screen
- **Automatic Inactivity Detection**: The extension automatically stops transcription when video is paused or tab is inactive
- **Support for any Website**: Works with YouTube, Netflix, local video files, and any website with audio content

## Installation

### From Chrome Web Store

1. Visit the Chrome Web Store page for [Estonian ASR Extension](https://chromewebstore.google.com/detail/estonian-asr-captions-gen/mkpaijfcijkdihjcipkfadinmmjmkadk?authuser=1&hl=en-GB)
2. Click "Add to Chrome"
3. Confirm the installation when prompted

### Manual Installation (Developer Mode)

1. Download the extension files or clone the repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now appear in your browser toolbar

## Usage

1. Navigate to any webpage with Estonian audio/video content
2. Click the Estonian ASR icon in your browser toolbar
3. Click "Alusta" (Start) to begin transcription
4. Captions will appear over the video content
5. To stop transcription, click "Peata" (Stop)
6. To clear captions, click "Tühjenda subtiitrid" (Clear captions)

### Caption Customization

You can customize the appearance of captions using the extension popup:

- **Teksti suurus**: Adjust caption text size
- **Reavahe**: Adjust line height between caption lines
- **Taustavärv**: Change caption background color
- **Tekstivärv**: Change caption text color

## Technical Details

The extension uses a combination of technologies to provide seamless transcription:

- **WebAssembly**: Powers the speech recognition engine for high-performance local processing
- **Chrome Extensions API**: Enables audio capture and browser integration
- **AudioWorklet API**: Processes audio streams efficiently

### Architecture Overview

- **Background Script**: Manages extension lifecycle and coordinates components
- **Content Script**: Displays and styles captions over web content
- **Options Page**: Hosts the WebAssembly speech recognition engine
- **Popup UI**: Provides user controls for the extension

## System Requirements

- **Browser**: Google Chrome (version 80 or higher)
- **Operating System**: Windows, macOS, Linux
- **RAM**: Minimum 4GB recommended for smooth transcription
- **CPU**: Modern multi-core processor recommended

## Privacy

The Estonian ASR Extension respects your privacy:

- All audio processing is done locally in your browser
- No audio data is sent to remote servers

## Known Limitations

- Currently supports Estonian language only
- Transcription accuracy may vary based on:
  - Audio quality and clarity
  - Background noise
  - Multiple speakers talking simultaneously
  - Speaker's accent and pronunciation

## Author

Developed by [Bohdan Podziubanchuk, TalTech Laboratory of Language Technology](https://taltech.ee/en/laboratory-language-technology).

## Support

For issues, feature requests, or questions, please:

- Open an issue on the [GitHub repository](https://github.com/Danbog32/eesti-asr-extension)
- Contact the TalTech Laboratory of Language Technology

---

© 2025 TalTech Laboratory of Language Technology. All rights reserved.
