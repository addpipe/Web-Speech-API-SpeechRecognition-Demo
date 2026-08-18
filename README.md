# Web Speech API SpeechRecognition Demo

This [Web Speech API Speech Recognition Demo](https://addpipe.com/tech-demos/web-speech-api-demo/) uses `getUserMedia()` and the Web Speech API's `SpeechRecognition` interface. 

It uses the following main `SpeechRecognition` properties: 
- `continuous`
- `interimResults` 
- `lang`
- `maxAlternatives`
- `processLocally` (where supported)

## How to use
1. Grant microphone permissions (and camera, unless you switch to audio-only capture).
2. Safari on macOS: When prompted, allow OS level Speech Recognition access. You can change this later from System Settings. In some cases, you may also need to enable Siri or Dictation.
3. Select a language. English (United States) is selected by default.
4. Start recording.
5. Speak in your selected language.
6. Stop recording, then download the caption files.

## Main features
- Real-time interim and final captions while recording
- Supports multiple languages, with per-phrase timings, confidence scores, and n-best alternatives
- Generated `.vtt`, `.srt`, `.json` and `.txt` files with the resulting transcription after a recording stops
- Subtitle file generated and applied for the video playback
- Audio-only capture mode, with automatic fallback if the camera is unavailable
- Live input level meter, so a silent microphone is obvious before blaming the API
- Environment & support panel: prefix used, secure context, on-device availability, recording formats
- On-device (offline) recognition and language-pack install where the browser exposes them
- Phrase biasing (`SpeechRecognitionPhrase`) where supported

## Event & error log
The page logs every `SpeechRecognition` lifecycle event (`start`, `audiostart`, `speechstart`,
`soundend`, `nomatch`, `end`, …), every `MediaRecorder` state change, every `getUserMedia()`
failure and every uncaught page error, each with the elapsed time since page load and a
plain-English explanation of the error code. The log can be filtered by level and copied to the
clipboard, which makes it useful when reporting a browser bug.

## Works on
- Chrome 33+
- Edge 79+
- Safari 14.1+ on macOS
- Safari on iOS 14.5+
- Opera 123+

## Known issues
- Firefox does not yet support it
- Getting it to work offline will be gimmicky. [Chrome 139](https://developer.chrome.com/release-notes/139#on-device_web_speech_api) allows it and, in our testing, in Safari it only worked offline with English
- It takes a few extra seconds for the Speech Recognition API to figure out when a non-English sentence ends
- Chrome ends a recognition session on its own after a stretch of silence even with `continuous = true`. The demo restarts it automatically, offsets the result indices so nothing is overwritten, and counts the restarts
- The API exposes no per-word timestamps, so caption cues are timed from the page clock and are approximate. Because two results can claim nearly the same instant, colliding cues are resolved by delaying the later one rather than truncating the earlier one
- The n-best list is not reliably ordered. Chrome has been observed returning a 1%-confidence alternative at index 0 ahead of a 91% one, so the demo ranks final results by reported confidence instead of trusting the position, and flags the swap in the log and the transcript
- There is no official list of supported languages. The spec defines none and no browser publishes one, so the language dropdown cannot be authoritative. Ours is assembled from [Google's Chrome speech demo](https://www.google.com/intl/en/chrome/demos/speech.html) and the [on-device speech recognition explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md). So some entries will not work in every browser. When that happens you will see a `language-not-supported` error in the event log
- There is no language auto-detection: the "Unspecified" option simply leaves `recognition.lang` unset so the browser falls back to the document/UA language, which the option label spells out
- In cloud mode (the Chrome/Edge default) audio is sent to a remote service for transcription

## Resources & Links
- [In-depth article](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/)
- [Separate text-to-speech demo](https://addpipe.com/tech-demos/web-speech-api-text-to-speech-demo/)
- [MDN: SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [A Quick Look at Apple's SpeechAnalyzer API](http://blog.addpipe.com/apple-speechanalyzer-api/)
