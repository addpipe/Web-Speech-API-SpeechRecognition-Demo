let mediaRecorder;
let recordedBlobs;
let stream;
let isRecording = false;
let language = "en-US";
let recognition;
let currIndex = -1; // Transcript current index
let transcriptStart = 0; // Timestamp when the transcript starts
let containerType = "video/webm"; // Defaults to webm but we switch to mp4 on Safari 14.0.2+
let recTimeStart = 0;

const speechRecognitionTranscription = {
  recordingId: "",
  lang: "",
  results: [],
};
const constraints = {
  audio: true,
  video: {
    width: { min: 640, ideal: 640, max: 640 },
    height: { min: 480, ideal: 480, max: 480 },
    framerate: 30,
  },
};

const video = document.getElementById("live");
const downloadLink = document.getElementById("downloadLink");
const downloadSRT = document.getElementById("downloadSRT");
const downloadVTT = document.getElementById("downloadVTT");
const downloadJSON = document.getElementById("downloadJSON");
const recButton = document.getElementById("rec");
const stopButton = document.getElementById("stop");
const languageSelect = document.getElementById("languageSelect");
const transcriptionText = document.getElementById("transcriptionText");
const subtitles = document.getElementById("subtitles");
const subtitleLines = document.querySelectorAll(".subtitle-line");
const audioDeviceSelect = document.getElementById("audioDevices");
let audioDevices = [];

const changeMicrophone = async (deviceId) => {
  const newConstraints = { ...constraints, audio: { deviceId: { exact: deviceId } } };
  stream = await navigator.mediaDevices.getUserMedia(newConstraints);
  video.srcObject = stream;
}

async function init() {
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  const availableDevices = await navigator.mediaDevices.enumerateDevices();
  audioDevices = availableDevices.filter(device => device.kind === "audioinput");
  if (audioDevices.length > 0) {
    const currentAudioDeviceLabel = stream.getAudioTracks()[0].label;
    audioDevices.forEach(device => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.innerText = device.label;
      if (currentAudioDeviceLabel === device.label) {
        option.setAttribute('selected', true);
      }
      audioDeviceSelect.appendChild(option);
    })
    audioDeviceSelect.style.display = "flex";
    audioDeviceSelect.addEventListener("change", (e) => {
      changeMicrophone(e.target.value);
    })
  }
}

function clearSubtitles() {
  subtitleLines.forEach((line) => (line.textContent = ""));
}

function updateSubtitles(text) {
  subtitleLines[0].textContent = text;
}

function onBtnRecordClicked() {
  if (isRecording) return;
  video.onended = null;
  video.src = null;
  video.controls = false;
  const playbackSubtitle = document.getElementById("playbackSubtitle");
  playbackSubtitle && playbackSubtitle.remove();
  video.srcObject = stream;

  isRecording = true;
  recordedBlobs = [];

  downloadSRT.style.display = "none";
  downloadVTT.style.display = "none";
  downloadJSON.style.display = "none";

  let options = { mimeType: "video/webm;codecs=vp9" };
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    options = { mimeType: "video/webm;codecs=vp9" };
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=h264")) {
    options = { mimeType: "video/webm;codecs=h264" };
  } else if (MediaRecorder.isTypeSupported("video/webm")) {
    options = { mimeType: "video/webm" };
  } else if (MediaRecorder.isTypeSupported("video/mp4")) {
    containerType = "video/mp4";
    options = { mimeType: "video/mp4" };
  }
  console.log("Using " + options.mimeType);
  try {
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleRecordingStop;
  } catch (e) {
    console.error("Exception while creating MediaRecorder:", e);
    return;
  }

  recTimeStart = new Date().getTime();
  mediaRecorder.start();

  recButton.disabled = true;
  audioDeviceSelect.disabled = true;
  stopButton.disabled = false;
  // transcribeButton.disabled = false;
  transcriptionText.innerHTML = "";
  clearSubtitles();
  currIndex = -1;
  speechRecognitionTranscription.recordingId = "";
  speechRecognitionTranscription.lang = languageSelect.value || "en-US";
  speechRecognitionTranscription.results = [];

  onTranscribeStart();
}

function onBtnStopClicked() {
  mediaRecorder.stop();

  recButton.disabled = false;
  audioDeviceSelect.disabled = false;
  stopButton.disabled = true;

  speechRecognitionTranscription.recordingId = name;

  transcriptionText.innerHTML =
    "<pre>" +
    JSON.stringify(speechRecognitionTranscription, undefined, 2) +
    "</pre>";

  if (!!recognition) {
    recognition.stop();
    clearSubtitles();

    downloadSRT.style.display = "block";
    downloadVTT.style.display = "block";
    downloadJSON.style.display = "block";
  }
}

function handleRecordingStop() {
  isRecording = false;
  const recording = new Blob(recordedBlobs, { type: mediaRecorder.mimeType });
  downloadLink.href = URL.createObjectURL(recording);

  const rand = Math.floor(Math.random() * 10000000);
  let name = "video_" + rand + ".webm";
  switch (containerType) {
    case "video/mp4":
      name = "video_" + rand + ".mp4";
      break;
    default:
      name = "video_" + rand + ".webm";
  }

  downloadLink.innerHTML = "Download " + name;
  downloadLink.setAttribute("download", name);
  downloadLink.setAttribute("name", name);

  // Display the playback
  video.srcObject = null;
  video.src = URL.createObjectURL(recording);
  video.controls = true;
  video.play();
  video.currentTime = 0;

  // Handle video playback end
  video.onended = () => {
    video.controls = false;
    video.srcObject = stream;
    const playbackSubtitle = document.getElementById("playbackSubtitle");
    playbackSubtitle && playbackSubtitle.remove();
  };

  // Add subtitle file
  const vttContent = jsonToVTT(speechRecognitionTranscription, false);
  if (!vttContent) return;

  const subtitleBlob = new Blob([vttContent], { type: "text/vtt" });
  const subtitleUrl = URL.createObjectURL(subtitleBlob);

  const trackElement = document.createElement("track");
  trackElement.id = "playbackSubtitle";
  trackElement.label = "Subtitle";
  trackElement.kind = "subtitles";
  trackElement.srclang = languageSelect.value || "en-US";
  trackElement.src = subtitleUrl;
  trackElement.default = true;

  video.appendChild(trackElement);
}

function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data);
  }
}

function formatTime(number) {
  const min = Math.floor(number / 60);
  const sec = Math.floor(number % 60);
  return `${min.toString().padStart(2, 0)}:${sec.toString().padStart(2, 0)}`;
}

function onTranscribeStart() {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech recognition not supported in this browser.");
    return;
  }

  // Check for null object
  if (!!recognition) {
    recognition.lang = languageSelect.value || "en-US";
    recognition.start();
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = languageSelect.value || "en-US";

  recognition.onresult = (event) => {
    const timeNow = new Date().getTime();
    const timeDifSec = (timeNow - recTimeStart) / 1000;
    // Check if a new transcription starts
    if (event.resultIndex !== currIndex) {
      currIndex = event.resultIndex;
      // Add a new entry
      speechRecognitionTranscription.results.push({
        startTime: formatTime(timeDifSec) || 0,
        endTime: 0,
        transcript: "",
      });
    }

    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      // Actively update the transcription output (in case "isFinal" does not reach "true")
      speechRecognitionTranscription.results[currIndex].transcript =
        event.results[i][0].transcript.trim();
      speechRecognitionTranscription.results[currIndex].endTime =
        formatTime(timeDifSec) || 0;

      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        if (!transcript) return;
        clearSubtitles();
        transcript = transcript.trim();
        transcript = transcript.charAt(0).toUpperCase() + transcript.slice(1); // Capitalize
        transcript += ".";
        speechRecognitionTranscription.results[currIndex].transcript =
          transcript;
        speechRecognitionTranscription.results[currIndex].endTime =
          formatTime(timeDifSec) || 0;
      }
    }
    updateSubtitles(transcript);
  };

  // Handle errors
  recognition.onerror = (event) => {
    if (event && event.error && event.error === "no-speech") return; // Ignore "no-speech" error. Not an actual error
    console.error("Speech recognition error:", event);
  };

  // Handle onend event. Prevent it from ending while recording
  recognition.onend = () => {
    if (isRecording) {
      recognition.start();
    }
  };

  recognition.start();
}

function formatFullTime(time, comma = false) {
  let [minutes, seconds] = time.split(":");
  return `00:${minutes}:${seconds}${comma ? "," : "."}000`;
}

function downloadFile(filename, content, type) {
  let element = document.createElement("a");
  element.setAttribute(
    "href",
    `data:text/${type};charset=utf-8,` + encodeURIComponent(content)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

// Generating VTT file
function jsonToVTT(json = speechRecognitionTranscription, download = true) {
  if (!json.results.length || isRecording) return "";
  let vttContent = "WEBVTT\n\n";
  json.results.forEach((result) => {
    vttContent += `${formatFullTime(result.startTime)} --> ${formatFullTime(
      result.endTime
    )}\n`;
    vttContent += `${result.transcript}\n\n`;
  });

  download && downloadFile("captions.vtt", vttContent, "vtt");

  return vttContent;
}

// Generating SRT file
function jsonToSRT(json = speechRecognitionTranscription, download = true) {
  if (!json.results.length || isRecording) return "";
  let srtContent = "";
  json.results.forEach((result, index) => {
    srtContent += `${index + 1}\n`;
    srtContent += `${formatFullTime(
      result.startTime,
      true
    )} --> ${formatFullTime(result.endTime, true)}\n`;
    srtContent += `${result.transcript}\n\n`;
  });

  download && downloadFile("captions.srt", srtContent, "srt");

  return srtContent;
}

// Generating and download JSON file
function downloadJson(json = speechRecognitionTranscription) {
  if (!json.results.length || isRecording) return "";
  downloadFile("captions.json", JSON.stringify(json, undefined, 2), "json");
}

languageSelect.addEventListener("change", (event) => {
  language = event.target.value;
});

downloadSRT.addEventListener("click", () => {
  jsonToSRT();
});

downloadVTT.addEventListener("click", () => {
  jsonToVTT();
});

downloadJSON.addEventListener("click", () => {
  downloadJson();
});

window.addEventListener("load", init);
