const camera = document.getElementById("camera");
const cameraBtn = document.getElementById("cameraBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const startBtn = document.getElementById("startBtn");
const repeatBtn = document.getElementById("repeatBtn");
const stopBtn = document.getElementById("stopBtn");
const detectBtn = document.getElementById("detectBtn");
const testVoiceBtn = document.getElementById("testVoiceBtn");

const statusText = document.getElementById("status");
const cameraStatus = document.getElementById("cameraStatus");
const aiStatus = document.getElementById("aiStatus");
const detectionsList = document.getElementById("detections");

let cameraStream = null;
let model = null;
let detectionRunning = false;
let loadingModel = null;
let detectionTask = null;

let lastInstruction = "";
let lastSpokenTime = {};
let speechQueue = [];
let isSpeaking = false;

const CONFIDENCE_THRESHOLD = 0.60;
const SPEECH_REPEAT_DELAY = 6000;

// Speak text using the browser's built-in voice.
function speak(message) {
  if (!("speechSynthesis" in window)) {
    statusText.textContent =
      "Speech is not supported in this browser.";
    return;
  }

  lastInstruction = message;
  speechQueue.push(message);
  processSpeechQueue();
}

// Speak announcements one at a time.
function processSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) {
    return;
  }

  isSpeaking = true;

  const message = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(message);

  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1;

  utterance.onend = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  utterance.onerror = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  window.speechSynthesis.speak(utterance);
}

// Load the AI model only once.
async function loadAIModel() {
  if (model) {
    return model;
  }

  if (loadingModel) {
    return loadingModel;
  }

  aiStatus.textContent = "Loading AI object detection model...";

  loadingModel = (async () => {
    try {
      model = await cocoSsd.load();

      aiStatus.textContent = "AI model loaded successfully.";
      return model;
    } catch (error) {
      console.error("Model loading error:", error);

      aiStatus.textContent =
        "Model failed to load. Check your internet connection.";

      throw error;
    } finally {
      loadingModel = null;
    }
  })();

  return loadingModel;
}

// Open the laptop camera.
async function openCamera() {
  if (cameraStream) {
    return true;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access is unavailable. Use a supported browser and secure page."
      );
    }

    cameraStatus.textContent = "Requesting camera permission...";

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user"
      },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();

    cameraStatus.textContent = "Camera is running.";
    return true;

  } catch (error) {
    console.error("Camera error:", error);

    cameraStatus.textContent =
      "Camera could not start. Check camera permission and settings.";

    statusText.textContent = error.message;
    return false;
  }
}

// Close the camera and stop its hardware stream.
function closeCamera() {
  stopDetection();

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  camera.srcObject = null;
  cameraStatus.textContent = "Camera is closed.";
}

// Announce an object without repeating it continuously.
function announceObject(objectName) {
  const now = Date.now();
  const previousTime = lastSpokenTime[objectName] || 0;

  if (now - previousTime < SPEECH_REPEAT_DELAY) {
    return;
  }

  lastSpokenTime[objectName] = now;

  speak(objectName + " detected.");
}

// Run one AI detection cycle at a time.
async function detectObjects() {
  if (!detectionRunning || !model || !cameraStream) {
    return;
  }

  if (camera.readyState < 2) {
    detectionTask = setTimeout(detectObjects, 500);
    return;
  }

  try {
    const predictions = await model.detect(camera);

    // Do not process stale results after navigation stops.
    if (!detectionRunning) {
      return;
    }

    detectionsList.replaceChildren();

    const visibleObjects = predictions.filter(
      item => item.score >= CONFIDENCE_THRESHOLD
    );

    if (visibleObjects.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No objects detected with sufficient confidence.";
      detectionsList.appendChild(li);
    }

    const seenObjects = new Set();

    visibleObjects.forEach(item => {
      const name = item.class;
      const confidence = Math.round(item.score * 100);

      const li = document.createElement("li");
      li.textContent = `${name} (${confidence}%)`;
      detectionsList.appendChild(li);

      // Announce each object category only once per repeat interval.
      if (!seenObjects.has(name)) {
        seenObjects.add(name);
        announceObject(name);
      }
    });

    aiStatus.textContent = visibleObjects.length
      ? `${visibleObjects.length} object detection(s) found.`
      : "Scanning for objects...";

  } catch (error) {
    console.error("Detection error:", error);
    aiStatus.textContent = "Detection error. Please try again.";
  }

  if (detectionRunning) {
    detectionTask = setTimeout(detectObjects, 1200);
  }
}

// Start AI detection.
async function startDetection() {
  const cameraReady = await openCamera();

  if (!cameraReady) {
    return;
  }

  try {
    await loadAIModel();

    if (detectionRunning) {
      return;
    }

    detectionRunning = true;
    detectBtn.textContent = "AI Detection Running";
    aiStatus.textContent = "Scanning for objects...";

    statusText.textContent = "Navigation and object detection started.";

    speak("Vision Guide AI started. Detecting objects.");

    detectObjects();

  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Could not start AI detection. Check your internet connection.";
  }
}

// Stop AI detection and clear pending announcements.
function stopDetection() {
  detectionRunning = false;

  if (detectionTask) {
    clearTimeout(detectionTask);
    detectionTask = null;
  }

  speechQueue = [];

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  isSpeaking = false;
  detectBtn.textContent = "Start AI Detection";
}

// Start Navigation.
startBtn.addEventListener("click", startDetection);

// Start AI Detection button.
detectBtn.addEventListener("click", () => {
  if (detectionRunning) {
    return;
  }

  startDetection();
});

// Open Camera button.
cameraBtn.addEventListener("click", openCamera);

// Close Camera button.
closeCameraBtn.addEventListener("click", closeCamera);

// Test Voice button.
testVoiceBtn.addEventListener("click", () => {
  speak("Hello! Vision Guide AI is working.");
});

// Repeat the last spoken instruction.
repeatBtn.addEventListener("click", () => {
  if (!lastInstruction) {
    speak("No previous instruction is available.");
    return;
  }

  speechQueue = [];
  window.speechSynthesis.cancel();
  isSpeaking = false;

  const message = new SpeechSynthesisUtterance(lastInstruction);
  message.lang = "en-US";
  message.rate = 0.9;

  isSpeaking = true;

  message.onend = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  message.onerror = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  window.speechSynthesis.speak(message);
});

// Stop Navigation button.
stopBtn.addEventListener("click", () => {
  stopDetection();

  statusText.textContent = "Navigation stopped.";
  aiStatus.textContent = "AI detection stopped.";

  // Keep the camera open so it can be restarted easily.
});

// Load the model when the user starts detection,
// rather than downloading it immediately on page load.
function testSpeech() {
  const status = document.getElementById("status");

  window.speechSynthesis.cancel();

  const message = new SpeechSynthesisUtterance(
    "Hello! Vision Guide AI is working. A person is detected."
  );

  message.lang = "en-US";
  message.volume = 1;
  message.rate = 0.8;

  message.onstart = () => {
    status.textContent = "Voice is speaking now.";
  };

  message.onerror = (event) => {
    status.textContent = "Voice error: " + event.error;
  };

  window.speechSynthesis.speak(message);
}
// Voice command controller
const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let voiceRecognition;
let voiceControlActive = false;

function speakMessage(message) {
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function startVoiceControl() {
  if (!SpeechRecognition) {
    speakMessage(
      "Voice recognition is not supported in this browser."
    );
    return;
  }

  if (voiceControlActive) return;

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "en-US";
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = false;
  voiceControlActive = true;

  voiceRecognition.onresult = function (event) {
    const result =
      event.results[event.results.length - 1][0].transcript
        .toLowerCase()
        .trim();

    console.log("Voice command:", result);

    if (result.includes("open camera")) {
      document.getElementById("cameraBtn").click();
      speakMessage("Opening camera.");
    } else if (
      result.includes("start detection") ||
      result.includes("start navigation")
    ) {
      document.getElementById("detectBtn").click();
      speakMessage("Starting object detection.");
    } else if (
      result.includes("what is in front of me") ||
      result.includes("repeat")
    ) {
      document.getElementById("repeatBtn").click();
    } else if (result.includes("stop detection")) {
      document.getElementById("stopBtn").click();
      speakMessage("Stopping detection.");
    } else if (result.includes("close camera")) {
      document.getElementById("closeCameraBtn").click();
      speakMessage("Closing camera.");
    } else if (result.includes("help")) {
      speakMessage(
        "Say open camera, start detection, repeat, stop detection, or close camera."
      );
    }
  };

  voiceRecognition.onerror = function (event) {
    console.log("Voice recognition error:", event.error);
  };

  voiceRecognition.onend = function () {
    voiceControlActive = false;
  };

  voiceRecognition.start();
  speakMessage(
    "Voice control is ready. Say open camera or start detection."
  );
}
// Try to start voice control when the page loads
window.addEventListener("load", function () {
    startVoiceControl();
});