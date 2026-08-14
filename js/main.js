/*
 * Web Speech API SpeechRecognition demo
 * https://github.com/addpipe/Web-Speech-API-SpeechRecognition-Demo
 *
 * Everything the recognition engine and the recorder report is funnelled through log()
 * so the page can show exactly what happened, and where.
 */

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const video = document.getElementById("live");
const videoContainer = document.getElementById("videoContainer");
const subtitles = document.getElementById("subtitles");
const subtitleLine = document.querySelector(".subtitle-line");

const recButton = document.getElementById("rec");
const stopButton = document.getElementById("stop");
const languageSelect = document.getElementById("languageSelect");
const languageHint = document.getElementById("languageHint");
const audioDeviceSelect = document.getElementById("audioDevices");
const useCameraCheckbox = document.getElementById("useCamera");
const processLocallyCheckbox = document.getElementById("processLocally");
const localModeRow = document.getElementById("localModeRow");
const localModeStatus = document.getElementById("localModeStatus");
const phrasesRow = document.getElementById("phrasesRow");
const phrasesInput = document.getElementById("phrasesInput");

const transcriptionText = document.getElementById("transcriptionText");
const transcriptionJson = document.getElementById("transcriptionJson");
const downloadLink = document.getElementById("downloadLink");
const downloadVTT = document.getElementById("downloadVTT");
const downloadSRT = document.getElementById("downloadSRT");
const downloadJSON = document.getElementById("downloadJSON");
const downloadTXT = document.getElementById("downloadTXT");
const copyTranscriptButton = document.getElementById("copyTranscript");

const logPanel = document.getElementById("logPanel");
const copyLogButton = document.getElementById("copyLog");
const clearLogButton = document.getElementById("clearLog");
const pageNotice = document.getElementById("pageNotice");
const supportTable = document.getElementById("supportTable");
const supportHint = document.getElementById("supportHint");

const recStatus = document.getElementById("recStatus");
const recStatusText = document.getElementById("recStatusText");
const levelBar = document.getElementById("levelBar");

const statElapsed = document.getElementById("statElapsed");
const statPhrases = document.getElementById("statPhrases");
const statWords = document.getElementById("statWords");
const statConfidence = document.getElementById("statConfidence");
const statRestarts = document.getElementById("statRestarts");
const statErrors = document.getElementById("statErrors");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const MAX_LOG_ROWS = 500;
/** Shortest a caption cue may be, and the longest that floor is allowed to grow to. */
const MIN_CUE_SECONDS = 0.8;
const MAX_MIN_CUE_SECONDS = 7;
const READING_CHARS_PER_SECOND = 18;

let stream = null;
let mediaRecorder = null;
let recordedBlobs = [];
let recognition = null;

let isRecording = false;
let recognitionRunning = false;
let stoppingIntentionally = false;
let fatalRecognitionError = null;

let recTimeStart = 0;
let elapsedTimer = null;
let restartCount = 0;
let errorCount = 0;

/** Recognition restarts reset event.resultIndex to 0, so results are stored at i + resultOffset. */
let resultOffset = 0;
let lastSessionResultCount = 0;
let restartTimeout = null;
let restartAttemptsSinceResult = 0;

let recordingObjectUrl = null;
let subtitleObjectUrl = null;

let audioContext = null;
let analyser = null;
let levelFrame = null;

const transcription = {
  recordingId: "",
  lang: "",
  processedLocally: false,
  results: [],
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const pageLoadedAt = performance.now();
const logEntries = [];

function sinceLoad() {
  const seconds = (performance.now() - pageLoadedAt) / 1000;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(min, 2)}:${pad(sec, 2)}.${pad(ms, 3)}`;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

/**
 * @param {"error"|"warn"|"info"|"debug"} level
 * @param {string} message
 * @param {unknown} [detail] Extra context, rendered under the message.
 */
function log(level, message, detail) {
  const time = sinceLoad();
  const detailText = detail === undefined ? "" : stringifyDetail(detail);
  logEntries.push({ time, level, message, detailText });

  if (level === "error") {
    errorCount += 1;
    statErrors.textContent = String(errorCount);
  }

  const emptyState = logPanel.querySelector(".log-empty");
  if (emptyState) emptyState.remove();

  const row = document.createElement("div");
  row.className = `log-row level-${level}`;

  const timeEl = document.createElement("span");
  timeEl.className = "log-time";
  timeEl.textContent = time;

  const levelEl = document.createElement("span");
  levelEl.className = "log-level";
  levelEl.textContent = level;

  const messageEl = document.createElement("span");
  messageEl.className = "log-message";
  messageEl.textContent = message;

  row.append(timeEl, levelEl, messageEl);

  if (detailText) {
    const detailEl = document.createElement("pre");
    detailEl.className = "log-detail";
    detailEl.textContent = detailText;
    row.appendChild(detailEl);
  }

  const wasAtBottom = logPanel.scrollTop + logPanel.clientHeight >= logPanel.scrollHeight - 24;
  logPanel.appendChild(row);

  while (logPanel.children.length > MAX_LOG_ROWS) {
    logPanel.removeChild(logPanel.firstChild);
  }
  if (logEntries.length > MAX_LOG_ROWS) logEntries.shift();

  if (wasAtBottom) logPanel.scrollTop = logPanel.scrollHeight;

  const consoleMethod = { error: "error", warn: "warn", debug: "debug" }[level] || "log";
  console[consoleMethod](`[${time}] ${message}`, detail === undefined ? "" : detail);
}

function stringifyDetail(detail) {
  if (detail instanceof Error) {
    return `${detail.name}: ${detail.message}`;
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch (_) {
    return String(detail);
  }
}

function showNotice(message, isError) {
  pageNotice.innerHTML = "";
  const label = document.createElement("strong");
  label.textContent = isError ? "Problem: " : "Heads up: ";
  pageNotice.append(label, document.createTextNode(message));
  pageNotice.classList.toggle("notice--error", Boolean(isError));
  pageNotice.classList.remove("is-hidden");
}

logPanel.parentElement.querySelectorAll(".log-filters input").forEach((input) => {
  input.addEventListener("change", () => {
    logPanel.classList.toggle(`hide-${input.dataset.level}`, !input.checked);
  });
  logPanel.classList.toggle(`hide-${input.dataset.level}`, !input.checked);
});

clearLogButton.addEventListener("click", () => {
  logEntries.length = 0;
  logPanel.innerHTML = '<p class="log-empty">No events yet.</p>';
  errorCount = 0;
  statErrors.textContent = "0";
});

copyLogButton.addEventListener("click", async () => {
  const text = logEntries
    .map((e) => `${e.time} [${e.level}] ${e.message}${e.detailText ? `\n    ${e.detailText.replace(/\n/g, "\n    ")}` : ""}`)
    .join("\n");
  await copyToClipboard(text || "(log is empty)", copyLogButton, "Copy log");
});

async function copyToClipboard(text, button, originalLabel) {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard API unavailable (needs a secure context)");
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = originalLabel), 1500);
  } catch (error) {
    log("warn", "Could not copy to clipboard", error);
    button.textContent = "Copy failed";
    setTimeout(() => (button.textContent = originalLabel), 1500);
  }
}

// Catch anything that escapes the handlers below.
window.addEventListener("error", (event) => {
  log("error", `Uncaught error: ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener("unhandledrejection", (event) => {
  log("error", "Unhandled promise rejection", event.reason);
});

// ---------------------------------------------------------------------------
// Support detection
// ---------------------------------------------------------------------------

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=h264",
  "video/webm",
  "video/mp4",
];

function supportedMimeType(candidates) {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function renderSupportTable() {
  const hasRecognition = Boolean(SpeechRecognitionCtor);
  const prefixed = !window.SpeechRecognition && Boolean(window.webkitSpeechRecognition);
  const hasMediaDevices = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasRecorder = typeof MediaRecorder !== "undefined";

  const rows = [
    ["Secure context", window.isSecureContext ? "yes" : "no — required", window.isSecureContext],
    [
      "SpeechRecognition",
      hasRecognition ? (prefixed ? "webkit-prefixed" : "unprefixed") : "not supported",
      hasRecognition ? (prefixed ? "partial" : true) : false,
    ],
    ["getUserMedia()", hasMediaDevices ? "supported" : "not supported", hasMediaDevices],
    ["MediaRecorder", hasRecorder ? "supported" : "not supported", hasRecorder],
    [
      "On-device recognition",
      hasRecognition && "available" in SpeechRecognitionCtor ? "API present" : "not exposed",
      hasRecognition && "available" in SpeechRecognitionCtor ? true : "partial",
    ],
    [
      "Phrase biasing",
      "SpeechRecognitionPhrase" in window ? "supported" : "not supported",
      "SpeechRecognitionPhrase" in window ? true : "partial",
    ],
    ["Video recording format", supportedMimeType(VIDEO_MIME_CANDIDATES) || "none", Boolean(supportedMimeType(VIDEO_MIME_CANDIDATES))],
    ["Audio recording format", supportedMimeType(AUDIO_MIME_CANDIDATES) || "none", Boolean(supportedMimeType(AUDIO_MIME_CANDIDATES))],
  ];

  supportTable.innerHTML = "";
  rows.forEach(([label, value, state]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dd.className = state === true ? "yes" : state === false ? "no" : "partial";
    wrapper.append(dt, dd);
    supportTable.appendChild(wrapper);
  });

  supportHint.textContent = navigator.userAgent;
}

// ---------------------------------------------------------------------------
// Media capture
// ---------------------------------------------------------------------------

const VIDEO_CONSTRAINTS = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30 },
};

function buildConstraints(deviceId) {
  return {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: useCameraCheckbox.checked ? VIDEO_CONSTRAINTS : false,
  };
}

function describeGetUserMediaError(error) {
  switch (error && error.name) {
    case "NotAllowedError":
      return "Permission denied. Allow microphone (and camera) access for this page, then reload.";
    case "NotFoundError":
      return "No matching microphone or camera was found on this device.";
    case "NotReadableError":
      return "The device is already in use by another application, or the OS refused access.";
    case "OverconstrainedError":
      return `No device satisfies the requested constraints (${error.constraint || "unknown constraint"}).`;
    case "SecurityError":
      return "Media capture is blocked — the page must be served over HTTPS or localhost.";
    case "AbortError":
      return "The device could not be started for an unknown hardware reason.";
    default:
      return error && error.message ? error.message : "Unknown getUserMedia() failure.";
  }
}

function stopStream(current) {
  if (!current) return;
  current.getTracks().forEach((track) => track.stop());
}

function watchTracks(current) {
  current.getTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      log("error", `${track.kind} track ended unexpectedly (device unplugged or taken over?)`, track.label);
      if (isRecording) stopRecording();
      recButton.disabled = true;
      setStatus("Input device lost — reload the page", false);
    });
    track.addEventListener("mute", () => log("warn", `${track.kind} track muted`, track.label));
    track.addEventListener("unmute", () => log("info", `${track.kind} track unmuted`, track.label));
  });
}

async function acquireStream(deviceId) {
  const wantsVideo = useCameraCheckbox.checked;
  try {
    return await navigator.mediaDevices.getUserMedia(buildConstraints(deviceId));
  } catch (error) {
    if (wantsVideo && error && error.name !== "NotAllowedError") {
      log("warn", `Camera request failed (${error.name}) — retrying audio-only`, describeGetUserMediaError(error));
      useCameraCheckbox.checked = false;
      return navigator.mediaDevices.getUserMedia(buildConstraints(deviceId));
    }
    throw error;
  }
}

async function startStream(deviceId) {
  // Release the current devices first: some hardware refuses a second open of the
  // same microphone and answers with NotReadableError.
  stopLevelMeter();
  stopStream(stream);
  stream = null;
  video.srcObject = null;

  stream = await acquireStream(deviceId);
  watchTracks(stream);

  const audioTrack = stream.getAudioTracks()[0];
  const videoTrack = stream.getVideoTracks()[0];
  videoContainer.classList.toggle("is-audio-only", !videoTrack);
  video.srcObject = videoTrack ? stream : null;

  log(
    "info",
    `Capturing ${videoTrack ? "audio + video" : "audio only"}`,
    {
      microphone: audioTrack ? audioTrack.label || "(unlabelled)" : "none",
      camera: videoTrack ? videoTrack.label || "(unlabelled)" : "none",
      audioSettings: audioTrack ? audioTrack.getSettings() : null,
    }
  );

  startLevelMeter();
  return stream;
}

async function refreshDeviceList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput" && device.deviceId);
    const activeLabel = stream && stream.getAudioTracks()[0] ? stream.getAudioTracks()[0].label : "";

    audioDeviceSelect.innerHTML = "";
    if (!inputs.length) {
      audioDeviceSelect.innerHTML = '<option value="">No microphone found</option>';
      audioDeviceSelect.disabled = true;
      log("warn", "enumerateDevices() returned no audio inputs");
      return;
    }

    inputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      if (device.label && device.label === activeLabel) option.selected = true;
      audioDeviceSelect.appendChild(option);
    });
    audioDeviceSelect.disabled = isRecording;
    log("debug", `Found ${inputs.length} audio input device(s)`);
  } catch (error) {
    log("error", "enumerateDevices() failed", error);
  }
}

/** A failed re-acquisition leaves the page without a stream, so make that state visible. */
function handleStreamFailure(context, error) {
  const message = describeGetUserMediaError(error);
  log("error", `${context} (${(error && error.name) || "unknown"})`, message);
  showNotice(`${message} Reload the page to try again.`, true);
  recButton.disabled = true;
  setStatus("No microphone access", false);
}

audioDeviceSelect.addEventListener("change", async (event) => {
  const deviceId = event.target.value;
  if (!deviceId || isRecording) return;
  try {
    await startStream(deviceId);
    log("info", "Switched microphone", audioDeviceSelect.selectedOptions[0].textContent);
  } catch (error) {
    handleStreamFailure("Could not switch microphone", error);
  }
});

useCameraCheckbox.addEventListener("change", async () => {
  if (isRecording) {
    useCameraCheckbox.checked = !useCameraCheckbox.checked;
    log("warn", "Camera cannot be toggled while recording");
    return;
  }
  try {
    await startStream(audioDeviceSelect.value);
  } catch (error) {
    handleStreamFailure("Could not reconfigure capture", error);
  }
});

if (navigator.mediaDevices && "ondevicechange" in navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    log("debug", "Media device list changed");
    refreshDeviceList();
  });
}

// ---------------------------------------------------------------------------
// Input level meter — makes a dead microphone obvious before blaming the API
// ---------------------------------------------------------------------------

function startLevelMeter() {
  stopLevelMeter();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !stream || !stream.getAudioTracks().length) return;

  try {
    audioContext = new AudioCtx();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const deviation = (samples[i] - 128) / 128;
        sum += deviation * deviation;
      }
      const rms = Math.sqrt(sum / samples.length);
      levelBar.style.width = `${Math.min(100, rms * 320).toFixed(1)}%`;
      levelFrame = requestAnimationFrame(tick);
    };
    tick();
  } catch (error) {
    log("warn", "Input level meter unavailable", error);
  }
}

function stopLevelMeter() {
  if (levelFrame) cancelAnimationFrame(levelFrame);
  levelFrame = null;
  analyser = null;
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  levelBar.style.width = "0%";
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function setStatus(text, live) {
  recStatusText.textContent = text;
  recStatus.classList.toggle("is-live", Boolean(live));
}

function elapsedSeconds() {
  return recTimeStart ? (performance.now() - recTimeStart) / 1000 : 0;
}

function revokeUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

function startRecording() {
  if (isRecording) return;
  if (!stream) {
    log("error", "Cannot record: no media stream. Grant permissions and reload.");
    return;
  }

  // Clear any playback state left over from the previous take.
  video.onended = null;
  video.removeAttribute("controls");
  video.pause();
  video.removeAttribute("src");
  video.load();
  const oldTrack = document.getElementById("playbackSubtitle");
  if (oldTrack) oldTrack.remove();
  revokeUrl(subtitleObjectUrl);
  revokeUrl(recordingObjectUrl);
  subtitleObjectUrl = null;
  recordingObjectUrl = null;
  downloadLink.textContent = "";
  downloadLink.removeAttribute("href");

  const hasVideo = stream.getVideoTracks().length > 0;
  video.srcObject = hasVideo ? stream : null;
  video.muted = true;
  if (hasVideo) video.play().catch((error) => log("debug", "Live preview play() rejected", error));

  const mimeType = supportedMimeType(hasVideo ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES);
  recordedBlobs = [];

  try {
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    log("error", "Could not create MediaRecorder", error);
    showNotice("This browser refused to create a MediaRecorder for the captured stream.", true);
    return;
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) recordedBlobs.push(event.data);
  };
  mediaRecorder.onstop = handleRecordingStop;
  mediaRecorder.onerror = (event) => {
    log("error", "MediaRecorder error", (event && event.error) || event);
    stopRecording();
  };

  try {
    mediaRecorder.start();
  } catch (error) {
    log("error", "MediaRecorder.start() threw", error);
    return;
  }

  isRecording = true;
  recTimeStart = performance.now();
  restartCount = 0;
  resultOffset = 0;
  lastSessionResultCount = 0;
  restartAttemptsSinceResult = 0;
  fatalRecognitionError = null;
  stoppingIntentionally = false;

  transcription.recordingId = "";
  transcription.lang = resolvedLanguage() || "(browser default)";
  transcription.processedLocally = false;
  transcription.results = [];

  clearSubtitles();
  renderTranscript();
  setExportsEnabled(false);
  log("info", `Recording started (${mediaRecorder.mimeType || "browser default container"})`);

  recButton.disabled = true;
  stopButton.disabled = false;
  audioDeviceSelect.disabled = true;
  languageSelect.disabled = true;
  useCameraCheckbox.disabled = true;
  processLocallyCheckbox.disabled = true;
  phrasesInput.disabled = true;

  setStatus("Recording", true);
  elapsedTimer = setInterval(() => {
    statElapsed.textContent = formatShort(elapsedSeconds());
  }, 200);

  startRecognition();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (error) {
      log("error", "MediaRecorder.stop() threw", error);
    }
  }

  stopRecognition();

  clearInterval(elapsedTimer);
  elapsedTimer = null;
  statElapsed.textContent = formatShort(elapsedSeconds());

  recButton.disabled = false;
  stopButton.disabled = true;
  audioDeviceSelect.disabled = false;
  languageSelect.disabled = false;
  useCameraCheckbox.disabled = false;
  processLocallyCheckbox.disabled = false;
  phrasesInput.disabled = false;

  clearSubtitles();
  setStatus("Idle", false);
  log("info", `Recording stopped after ${formatShort(elapsedSeconds())}`);
}

function handleRecordingStop() {
  const type = (mediaRecorder && mediaRecorder.mimeType) || "video/webm";
  const recording = new Blob(recordedBlobs, { type });

  if (!recording.size) {
    log("warn", "Recording produced no data — nothing to play back or download");
  }

  const extension = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
  const kind = type.startsWith("audio") ? "audio" : "video";
  const name = `${kind}_${Math.floor(Math.random() * 10000000)}.${extension}`;

  transcription.recordingId = name;
  renderTranscript();

  revokeUrl(recordingObjectUrl);
  recordingObjectUrl = URL.createObjectURL(recording);
  downloadLink.href = recordingObjectUrl;
  downloadLink.textContent = `Download ${name} (${(recording.size / 1048576).toFixed(2)} MB)`;
  downloadLink.setAttribute("download", name);

  log("info", `Recording finalized: ${name}`, `${recording.size} bytes, ${type}`);

  const hasFinalText = transcription.results.some((r) => r.isFinal && r.transcript);
  setExportsEnabled(hasFinalText);
  if (!hasFinalText) {
    log("warn", "No final transcription results — caption exports stay disabled");
  }

  if (kind !== "video" || !recording.size) return;

  // Play the take back with the generated subtitle track attached.
  video.srcObject = null;
  video.src = recordingObjectUrl;
  video.controls = true;
  video.muted = false;

  const vttContent = buildVTT();
  if (vttContent) {
    const subtitleBlob = new Blob([vttContent], { type: "text/vtt" });
    revokeUrl(subtitleObjectUrl);
    subtitleObjectUrl = URL.createObjectURL(subtitleBlob);

    const trackElement = document.createElement("track");
    trackElement.id = "playbackSubtitle";
    trackElement.label = "Generated captions";
    trackElement.kind = "subtitles";
    trackElement.srclang = (resolvedLanguage() || "en-US").split("-")[0];
    trackElement.src = subtitleObjectUrl;
    trackElement.default = true;
    video.appendChild(trackElement);
    log("info", `Attached generated subtitle track (${transcription.results.length} cues)`);
  }

  video.play().catch((error) => log("debug", "Playback play() rejected", error));

  video.onended = () => {
    video.controls = false;
    video.muted = true;
    const track = document.getElementById("playbackSubtitle");
    if (track) track.remove();
    if (stream && stream.getVideoTracks().length) video.srcObject = stream;
  };
}

recButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);

// ---------------------------------------------------------------------------
// Speech recognition
// ---------------------------------------------------------------------------

const RECOGNITION_ERRORS = {
  "no-speech": "No speech detected. The engine heard only silence — check the input level meter.",
  aborted: "Recognition was aborted (usually because stop()/abort() was called or the page changed).",
  "audio-capture": "No audio input could be captured. The microphone is missing or blocked at OS level.",
  network: "The recognition service could not be reached. Cloud recognition needs a working connection.",
  "not-allowed": "The user agent or user blocked speech recognition. On macOS Safari also check System Settings › Privacy & Security › Speech Recognition.",
  "service-not-allowed": "The recognition service refused the request (policy, OS setting or unsupported configuration).",
  "bad-grammar": "The supplied grammar or phrase list could not be compiled.",
  "language-not-supported": "The selected language is not supported by this recognition service.",
  "phrases-not-supported": "Phrase biasing is not supported for this configuration (it usually requires on-device mode).",
};

/** "auto" means: don't set lang, let the browser fall back to the document/UA language. */
function resolvedLanguage() {
  const value = languageSelect.value;
  return value === "auto" ? "" : value;
}

function applyPhrases(rec) {
  const raw = phrasesInput.value.trim();
  if (!raw || !("SpeechRecognitionPhrase" in window)) return;

  const terms = raw
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!terms.length) return;

  try {
    rec.phrases = terms.map((term) => new window.SpeechRecognitionPhrase(term, 2.0));
    log("info", `Applied ${terms.length} biasing phrase(s)`, terms.join(", "));
    if (!processLocallyCheckbox.checked) {
      log("warn", "Phrase biasing usually requires on-device mode — it may be ignored in cloud mode");
    }
  } catch (error) {
    log("warn", "Could not apply phrase biasing", error);
  }
}

function createRecognition() {
  const rec = new SpeechRecognitionCtor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  const lang = resolvedLanguage();
  if (lang) {
    rec.lang = lang;
  } else {
    log("info", `Language left unset — the browser will use "${document.documentElement.lang || navigator.language}"`);
  }

  if (processLocallyCheckbox.checked && "processLocally" in rec) {
    try {
      rec.processLocally = true;
      transcription.processedLocally = true;
      log("info", "Requested on-device processing (processLocally = true)");
    } catch (error) {
      log("warn", "processLocally could not be enabled", error);
    }
  }

  applyPhrases(rec);

  rec.onstart = () => {
    recognitionRunning = true;
    log("info", "SpeechRecognition session started");
  };

  rec.onaudiostart = () => log("debug", "audiostart — capturing audio");
  rec.onaudioend = () => log("debug", "audioend — stopped capturing audio");
  rec.onsoundstart = () => log("debug", "soundstart — some sound detected");
  rec.onsoundend = () => log("debug", "soundend");
  rec.onspeechstart = () => log("debug", "speechstart — speech detected");
  rec.onspeechend = () => log("debug", "speechend");
  rec.onnomatch = () => log("warn", "nomatch — speech was heard but no result met the confidence threshold");

  rec.onresult = handleResult;
  rec.onerror = handleRecognitionError;
  rec.onend = handleRecognitionEnd;

  return rec;
}

function startRecognition() {
  if (!SpeechRecognitionCtor) {
    log("error", "SpeechRecognition is not available in this browser — recording audio/video only");
    return;
  }

  try {
    recognition = createRecognition();
  } catch (error) {
    log("error", "Could not construct SpeechRecognition", error);
    return;
  }

  safeStartRecognition("initial start");
}

function safeStartRecognition(reason) {
  if (!recognition || recognitionRunning) return;
  try {
    recognition.start();
    log("debug", `SpeechRecognition.start() called (${reason})`);
  } catch (error) {
    // InvalidStateError means it is already running — anything else is real.
    if (error && error.name === "InvalidStateError") {
      log("debug", "start() ignored: recognition already running");
      recognitionRunning = true;
      return;
    }
    log("error", `SpeechRecognition.start() failed (${reason})`, error);
  }
}

function stopRecognition() {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  const current = recognition;
  recognition = null;
  recognitionRunning = false;
  if (!current) return;

  stoppingIntentionally = true;
  // Detach the auto-restart handler: this instance is finished, and a late onend
  // must not be able to revive it (or the next one) behind our back.
  current.onend = () => log("debug", "SpeechRecognition session ended (after stop)");

  try {
    current.stop();
  } catch (error) {
    log("warn", "SpeechRecognition.stop() threw", error);
  }
}

function handleRecognitionError(event) {
  const code = (event && event.error) || "unknown";
  const explanation = RECOGNITION_ERRORS[code] || "Unrecognised error code.";
  const detail = [explanation, event && event.message ? `message: ${event.message}` : ""]
    .filter(Boolean)
    .join("\n");

  if (code === "no-speech") {
    log("warn", "Recognition error: no-speech", detail);
    return;
  }
  if (code === "aborted" && stoppingIntentionally) {
    log("debug", "Recognition aborted by stop() — expected", detail);
    return;
  }

  log("error", `Recognition error: ${code}`, detail);

  // These will not recover by restarting, so stop trying.
  if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(code)) {
    fatalRecognitionError = code;
    showNotice(explanation, true);
    if (isRecording) {
      log("warn", "Stopping speech recognition — the error is not recoverable by restarting");
    }
  }
}

function handleRecognitionEnd() {
  recognitionRunning = false;
  resultOffset += lastSessionResultCount;
  lastSessionResultCount = 0;
  log("debug", "SpeechRecognition session ended");

  if (!isRecording || fatalRecognitionError) {
    stoppingIntentionally = false;
    recognition = null;
    return;
  }

  // Chrome ends the session after a silence gap even with continuous = true.
  restartAttemptsSinceResult += 1;
  if (restartAttemptsSinceResult > 20) {
    log("error", "Recognition restarted 20 times without a single result — giving up to avoid a restart loop");
    fatalRecognitionError = "restart-loop";
    return;
  }

  restartCount += 1;
  statRestarts.textContent = String(restartCount);
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    if (isRecording && !fatalRecognitionError) {
      log("debug", `Auto-restarting recognition (#${restartCount})`);
      safeStartRecognition("auto-restart");
    }
  }, 250);
}

function handleResult(event) {
  const now = elapsedSeconds();
  lastSessionResultCount = event.results.length;
  restartAttemptsSinceResult = 0;

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const best = result[0];
    if (!best) continue;

    const index = resultOffset + i;
    let entry = transcription.results[index];
    if (!entry) {
      entry = {
        index,
        startTime: formatTimecode(now),
        endTime: formatTimecode(now),
        startSeconds: round(now),
        endSeconds: round(now),
        transcript: "",
        confidence: null,
        isFinal: false,
        pickedAlternative: 0,
        alternatives: [],
      };
      transcription.results[index] = entry;
    }

    entry.endSeconds = round(now);
    entry.endTime = formatTimecode(now);
    entry.isFinal = result.isFinal;

    if (!result.isFinal) {
      // Interim: every alternative reports confidence 0, so ranking them would just
      // make the live caption flicker between wordings. Stick to the primary one.
      entry.transcript = (best.transcript || "").trim();
      entry.confidence = null;
      entry.pickedAlternative = 0;
      continue;
    }

    const ranked = rankAlternatives(result);
    const winner = ranked[0];
    if (!winner) continue;

    entry.transcript = finalizeSentence(winner.transcript);
    entry.confidence = winner.confidence;
    entry.pickedAlternative = winner.originalIndex;
    entry.alternatives = ranked.slice(1).map(({ transcript, confidence }) => ({ transcript, confidence }));

    if (winner.originalIndex !== 0) {
      log(
        "warn",
        `Alternative #${winner.originalIndex + 1} outranked the primary result — using it instead`,
        {
          used: `"${winner.transcript}" (${formatConfidence(winner.confidence)})`,
          primary: `"${(best.transcript || "").trim()}" (${formatConfidence(
            typeof best.confidence === "number" ? best.confidence : null
          )})`,
        }
      );
    }

    log("info", `Final result #${index + 1}: "${entry.transcript}"`, {
      startTime: entry.startTime,
      endTime: entry.endTime,
      confidence: entry.confidence,
      alternatives: entry.alternatives.map((a) => a.transcript),
    });
  }

  const last = transcription.results[transcription.results.length - 1];
  updateSubtitles(last ? last.transcript : "");
  renderTranscript();
}

/**
 * The spec says the n-best list is ordered most-likely-first, but Chrome has been observed
 * putting a 1%-confidence alternative at index 0 ahead of a 91% one. Rank by the reported
 * confidence instead of trusting the position, keeping the original index so the swap stays
 * auditable in the JSON and the log.
 *
 * Engines that report no confidence at all (every value 0 or missing) fall through to the
 * original ordering, because the tiebreaker is the original index.
 */
function rankAlternatives(result) {
  return Array.from(result)
    .map((alt, originalIndex) => ({
      transcript: (alt.transcript || "").trim(),
      confidence:
        typeof alt.confidence === "number" && alt.confidence > 0 ? round(alt.confidence, 3) : null,
      originalIndex,
    }))
    .filter((alt) => alt.transcript)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || a.originalIndex - b.originalIndex);
}

function formatConfidence(value) {
  return value === null || value === undefined ? "n/a" : `${Math.round(value * 100)}%`;
}

function finalizeSentence(text) {
  if (!text) return "";
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?…。！？]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function clearSubtitles() {
  updateSubtitles("");
}

function updateSubtitles(text) {
  subtitleLine.textContent = text || "";
  subtitles.classList.toggle("is-empty", !text);
}

function finalResults() {
  return transcription.results.filter((result) => result && result.isFinal && result.transcript);
}

function renderTranscript() {
  const results = transcription.results.filter(Boolean);

  if (!results.length) {
    transcriptionText.innerHTML = '<p class="placeholder">Nothing yet — press Record and start talking.</p>';
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach((result) => {
      const row = document.createElement("div");
      row.className = `phrase${result.isFinal ? "" : " is-interim"}`;

      const time = document.createElement("span");
      time.className = "phrase-time";
      time.textContent = `${formatShort(result.startSeconds)}–${formatShort(result.endSeconds)}`;

      const text = document.createElement("span");
      text.className = "phrase-text";
      text.textContent = result.transcript || "…";

      const confidence = document.createElement("span");
      confidence.className = "phrase-confidence";
      confidence.textContent = result.isFinal ? formatConfidence(result.confidence) : "interim";
      if (result.pickedAlternative) {
        confidence.textContent += ` ·#${result.pickedAlternative + 1}`;
        confidence.title = `The engine returned this text at position ${result.pickedAlternative + 1} of its n-best list, but gave it the highest confidence, so it was used instead of the first entry.`;
      }

      row.append(time, text, confidence);

      if (result.alternatives && result.alternatives.length) {
        const alts = document.createElement("span");
        alts.className = "phrase-alts";
        alts.textContent = `alternatives: ${result.alternatives
          .map((a) => `${a.transcript} (${formatConfidence(a.confidence)})`)
          .join(" · ")}`;
        row.appendChild(alts);
      }

      fragment.appendChild(row);
    });
    transcriptionText.innerHTML = "";
    transcriptionText.appendChild(fragment);
    transcriptionText.scrollTop = transcriptionText.scrollHeight;
  }

  transcriptionJson.textContent = JSON.stringify(transcription, null, 2);

  const finals = finalResults();
  const words = finals.reduce((total, r) => total + r.transcript.split(/\s+/).filter(Boolean).length, 0);
  const scored = finals.filter((r) => r.confidence !== null);
  statPhrases.textContent = String(finals.length);
  statWords.textContent = String(words);
  statConfidence.textContent = scored.length
    ? `${Math.round((scored.reduce((t, r) => t + r.confidence, 0) / scored.length) * 100)}%`
    : "—";
}

function setExportsEnabled(enabled) {
  [downloadVTT, downloadSRT, downloadJSON, downloadTXT, copyTranscriptButton].forEach((button) => {
    button.disabled = !enabled;
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function formatShort(seconds) {
  const safe = Math.max(0, seconds || 0);
  return `${pad(Math.floor(safe / 60), 2)}:${pad(Math.floor(safe % 60), 2)}`;
}

/** HH:MM:SS.mmm (VTT) or HH:MM:SS,mmm (SRT). */
function formatTimecode(seconds, comma = false) {
  const safe = Math.max(0, seconds || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}${comma ? "," : "."}${pad(Math.min(ms, 999), 3)}`;
}

/** How long a cue must stay up to be readable, based on its length. */
function readableDuration(text) {
  const needed = text.length / READING_CHARS_PER_SECOND;
  return Math.min(MAX_MIN_CUE_SECONDS, Math.max(MIN_CUE_SECONDS, needed));
}

/**
 * Guarantees strictly increasing, readable cues — players reject zero-length and
 * overlapping ones.
 *
 * Timings come from the page clock, so two results can claim almost the same instant.
 * Resolve that by delaying the *later* cue rather than truncating the earlier one: an
 * earlier version squeezed collided cues down to ~190ms, which is invisible on playback.
 */
function cueTimes() {
  let previousEnd = 0;

  return finalResults().map((result) => {
    const start = Math.max(result.startSeconds, previousEnd);
    const end = Math.max(result.endSeconds, start + readableDuration(result.transcript));
    previousEnd = end;
    return { start, end, transcript: result.transcript };
  });
}

function buildVTT() {
  const cues = cueTimes();
  if (!cues.length) return "";
  let content = "WEBVTT\n\n";
  cues.forEach((cue, index) => {
    content += `${index + 1}\n`;
    content += `${formatTimecode(cue.start)} --> ${formatTimecode(cue.end)}\n`;
    content += `${cue.transcript}\n\n`;
  });
  return content;
}

function buildSRT() {
  const cues = cueTimes();
  if (!cues.length) return "";
  let content = "";
  cues.forEach((cue, index) => {
    content += `${index + 1}\n`;
    content += `${formatTimecode(cue.start, true)} --> ${formatTimecode(cue.end, true)}\n`;
    content += `${cue.transcript}\n\n`;
  });
  return content;
}

function buildPlainText() {
  return finalResults()
    .map((result) => result.transcript)
    .join(" ");
}

function downloadFile(filename, content, mimeType) {
  if (!content) {
    log("warn", `Nothing to export as ${filename}`);
    return;
  }
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    log("info", `Exported ${filename}`, `${content.length} characters`);
  } catch (error) {
    log("error", `Export of ${filename} failed`, error);
  }
}

downloadVTT.addEventListener("click", () => downloadFile("captions.vtt", buildVTT(), "text/vtt"));
downloadSRT.addEventListener("click", () => downloadFile("captions.srt", buildSRT(), "application/x-subrip"));
downloadTXT.addEventListener("click", () => downloadFile("transcript.txt", buildPlainText(), "text/plain"));
downloadJSON.addEventListener("click", () =>
  downloadFile("captions.json", JSON.stringify(transcription, null, 2), "application/json")
);
copyTranscriptButton.addEventListener("click", () =>
  copyToClipboard(buildPlainText(), copyTranscriptButton, "Copy text")
);

// ---------------------------------------------------------------------------
// On-device availability
// ---------------------------------------------------------------------------

const AVAILABILITY_TEXT = {
  available: "Ready — this language runs entirely on-device.",
  downloadable: "Supported, but the language pack must be downloaded first.",
  downloading: "The language pack is downloading right now.",
  unavailable: "Not available on-device for this language; the cloud service will be used.",
};

async function refreshLocalAvailability() {
  if (!SpeechRecognitionCtor || !("available" in SpeechRecognitionCtor)) {
    localModeRow.classList.add("is-hidden");
    return;
  }

  const lang = resolvedLanguage() || navigator.language || "en-US";
  localModeStatus.textContent = "Checking on-device availability…";

  try {
    const status = await SpeechRecognitionCtor.available({ langs: [lang], processLocally: true });
    localModeStatus.textContent = `${lang}: ${AVAILABILITY_TEXT[status] || status}`;
    log("info", `On-device availability for ${lang}: ${status}`);

    if (status === "downloadable" && !document.getElementById("installPack")) {
      const button = document.createElement("button");
      button.id = "installPack";
      button.type = "button";
      button.className = "button button--secondary button--small";
      button.textContent = "Download language pack";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Downloading…";
        try {
          const ok = await SpeechRecognitionCtor.install({ langs: [lang], processLocally: true });
          log(ok ? "info" : "warn", `Language pack install for ${lang} ${ok ? "succeeded" : "was refused"}`);
        } catch (error) {
          log("error", `Language pack install for ${lang} failed`, error);
        } finally {
          button.remove();
          refreshLocalAvailability();
        }
      });
      localModeStatus.appendChild(button);
    }
  } catch (error) {
    localModeStatus.textContent = "On-device availability could not be determined.";
    log("warn", "SpeechRecognition.available() failed", error);
  }
}

processLocallyCheckbox.addEventListener("change", () => {
  log("info", `On-device mode ${processLocallyCheckbox.checked ? "requested" : "disabled"}`);
});

languageSelect.addEventListener("change", () => {
  const lang = resolvedLanguage();
  languageHint.textContent = lang
    ? `Recognition language tag: ${lang}`
    : `No lang set — the browser falls back to "${document.documentElement.lang || navigator.language}". There is no true auto-detection in the Web Speech API.`;
  log("info", `Language set to ${lang || "(browser default)"}`);
  refreshLocalAvailability();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function init() {
  renderSupportTable();
  languageSelect.dispatchEvent(new Event("change"));

  phrasesRow.classList.toggle("is-hidden", !("SpeechRecognitionPhrase" in window));
  if (!("SpeechRecognitionPhrase" in window)) {
    log("debug", "SpeechRecognitionPhrase is not implemented — phrase biasing hidden");
  }

  if (!window.isSecureContext) {
    const message = "This page is not running in a secure context. getUserMedia() and speech recognition require HTTPS or localhost.";
    log("error", message);
    showNotice(message, true);
    return;
  }

  if (!SpeechRecognitionCtor) {
    const message = "This browser does not implement SpeechRecognition (Firefox, for example). You can still record, but nothing will be transcribed.";
    log("error", message);
    showNotice(message, false);
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const message = "getUserMedia() is not available in this browser, so nothing can be captured.";
    log("error", message);
    showNotice(message, true);
    return;
  }

  if (typeof MediaRecorder === "undefined") {
    log("warn", "MediaRecorder is not supported — live captions will work but nothing can be recorded or downloaded");
  }

  try {
    await startStream();
    await refreshDeviceList();
    recButton.disabled = typeof MediaRecorder === "undefined";
    setStatus("Ready", false);
    log("info", "Ready");
  } catch (error) {
    const message = describeGetUserMediaError(error);
    log("error", `getUserMedia() failed (${(error && error.name) || "unknown"})`, message);
    showNotice(message, true);
    setStatus("No microphone access", false);
  }
}

window.addEventListener("pagehide", () => {
  if (isRecording) stopRecording();
  if (recognition) {
    try {
      recognition.abort();
    } catch (_) {
      /* nothing useful to do while the page is going away */
    }
  }
  stopLevelMeter();
  stopStream(stream);
  revokeUrl(recordingObjectUrl);
  revokeUrl(subtitleObjectUrl);
});

init();
