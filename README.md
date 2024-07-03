# Web Speech API SpeechRecognition Demo

This Web Speech API Speech Recognition Demo uses `getUserMedia()` and the Web Speech API's `SpeechRecognition` interface. 

It uses the following main `SpeechRecognition` properties: 
- `continuous`
- `interimResults` 
- `lang`

## How to use
1. Grant camera + microphone permissions
1. Select a language (default is english)
1. Start a recording
1. Speak in the chosen language a few times
1. Stop the recording

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