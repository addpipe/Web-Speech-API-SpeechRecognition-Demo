# Web Speech API SpeechRecognition Demo

This [Web Speech API Speech Recognition Demo](https://addpipe.com/tech-demos/web-speech-api-demo/) uses `getUserMedia()` and the Web Speech API's `SpeechRecognition` interface. 

It uses the following main `SpeechRecognition` properties: 
- `continuous`
- `interimResults` 
- `lang`

## How to use
1. Grant camera and microphone permissions.
2. Safari on macOS: When prompted, allow OS level Speech Recognition access. You can change this later from System Settings. In some cases, you may also need to enable Siri or Dictation.
3. Select a language. English is selected by default, or you can use automatic language detection.
4. Start recording.
5. Speak in your selected language.
6. Stop recording.

## Main features
- Real-time captions while recording
- Multi-language captions
- Generated `.rtt`, `.srt` and `.JSON` files with the resulted transcription after a recording stops
- Subtitle file generated and applied for the video playback

## Works on
- Chrome 33+
- Edge 79+
- Safari 14.1+ on macOS
- Safari on iOS 14.5+

## Known issues
- No support for Firefox and Opera yet
- Only works when connected to a network
- It takes a few extra seconds for the Speech Recognition API to figure out when a non-english sentence ends

## Resources & Links
- [In-depth article](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/)
- [Separate text-to-speech demo](https://addpipe.com/tech-demos/web-speech-api-text-to-speech-demo/)
- [MDN: SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
