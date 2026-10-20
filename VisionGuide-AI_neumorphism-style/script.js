document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const videoFeed = document.getElementById('video-feed');
    const detectionCanvas = document.getElementById('detection-canvas');
    const langToggleBtn = document.getElementById('lang-toggle-btn');
    const langBtnLabel = document.getElementById('lang-btn-label');
    const speechToggleBtn = document.getElementById('speech-toggle-btn');
    const speechBtnLabel = document.getElementById('speech-btn-label');
    const transcriptOutput = document.getElementById('transcript-output');
    const statusText = document.getElementById('status-text');
    const systemStatusDot = document.getElementById('system-status-dot');
    const detectedObjectLabel = document.getElementById('detected-object-label');
    const detectionConfidenceTag = document.getElementById('detection-confidence-tag');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const switchCameraBtn = document.getElementById('switch-camera-btn');

    // State Variables
    let speechAudioEnabled = true;
    let cameraActive = false;
    let currentStream = null;
    let facingMode = 'environment';
    let liveDetectionInterval = null;
    let lastSpokenItem = '';
    let cocoModel = null;
    let currentLanguage = 'en'; // 'en' or 'ur'
    let currentAudio = null;
    let lastToggleTime = 0;

    // Display Text Map for Urdu UI Transcripts
    const urduDisplayMap = {
        'person': 'Samne aik shakhs hai',
        'backpack': 'Samne backpack hai',
        'handbag': 'Samne handbag hai',
        'suitcase': 'Samne suitcase hai',
        'laptop': 'Samne laptop hai',
        'tv': 'Samne TV hai',
        'bicycle': 'Samne cycle hai',
        'car': 'Samne gari hai',
        'motorcycle': 'Samne motorcycle hai',
        'stop sign': 'Samne stop sign hai',
        'bus': 'Samne bus hai',
        'traffic light': 'Samne traffic light hai',
        'chair': 'Samne kursi hai',
        'bottle': 'Samne bottle hai',
        'knife': 'Samne chhuri hai',
        'dog': 'Samne kutta hai',
        'cow': 'Samne gaye hai'
    };

    // Load Local COCO-SSD Model Completely Offline
    async function loadDetectionModel() {
        try {
            updateStatus('Loading Local Model...', '#f59e0b');
            cocoModel = await cocoSsd.load({ modelUrl: './model/model.json' });
            updateStatus('Offline System Active', '#10b981');
            transcriptOutput.textContent = 'Offline model loaded. Point camera at objects for live detection.';
            initCamera();
        } catch (err) {
            console.error('Failed to load local model:', err);
            updateStatus('Model Error', '#ef4444');
            transcriptOutput.textContent = 'Failed to load offline model files from ./model/ directory.';
        }
    }

    // Camera Initialization
    async function initCamera() {
        if (cameraActive && currentStream) return;

        try {
            const constraints = {
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            };

            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoFeed.srcObject = currentStream;
            cameraActive = true;
            
            startLiveDetection();
            initOfflineVoiceCommands();
        } catch (err) {
            console.error('Camera access error:', err);
            updateStatus('Camera Inactive', '#ef4444');
            transcriptOutput.textContent = 'Unable to access camera feed. Please grant permissions.';
            stopLiveDetection();
        }
    }

    function updateStatus(message, color) {
        statusText.textContent = message;
        systemStatusDot.style.backgroundColor = color;
        systemStatusDot.style.boxShadow = `0 0 8px ${color}`;
    }

    function startLiveDetection() {
        if (liveDetectionInterval) clearInterval(liveDetectionInterval);
        liveDetectionInterval = setInterval(() => {
            if (cameraActive && videoFeed.readyState === 4 && cocoModel) {
                processVideoFrame();
            }
        }, 1200);
    }

    function stopLiveDetection() {
        if (liveDetectionInterval) {
            clearInterval(liveDetectionInterval);
            liveDetectionInterval = null;
        }
    }

    async function processVideoFrame() {
        detectionCanvas.width = videoFeed.videoWidth || 640;
        detectionCanvas.height = videoFeed.videoHeight || 480;
        const ctx = detectionCanvas.getContext('2d');
        ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);

        if (videoFeed.currentTime > 0 && !videoFeed.paused && !videoFeed.ended) {
            const predictions = await cocoModel.detect(videoFeed);

            if (predictions && predictions.length > 0) {
                const topPrediction = predictions[0];
                const confidencePercent = Math.round(topPrediction.score * 100);

                drawBoundingBox(ctx, topPrediction.bbox, topPrediction.class);
                handleDetectionResult(topPrediction.class, confidencePercent);
            } else {
                detectedObjectLabel.textContent = 'Scanning frame...';
                if (detectionConfidenceTag) detectionConfidenceTag.textContent = '0%';
            }
        }
    }

    function drawBoundingBox(ctx, bbox, label) {
        const [x, y, width, height] = bbox;
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
        ctx.fillRect(x, y > 24 ? y - 24 : y, ctx.measureText(label).width + 16, 24);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(label, x + 8, y > 24 ? y - 8 : y + 16);
    }

    function handleDetectionResult(item, confidence) {
        detectedObjectLabel.textContent = item;
        if (detectionConfidenceTag) detectionConfidenceTag.textContent = `${confidence}%`;
        
        if (currentLanguage === 'ur') {
            transcriptOutput.textContent = urduDisplayMap[item] || `Samne ${item} hai`;
        } else {
            transcriptOutput.textContent = `Detected ${item}`;
        }

        if (speechAudioEnabled && item !== lastSpokenItem) {
            const fileName = item.replace(/\s+/g, '_').toLowerCase();
            const audioPath = `./audio/${currentLanguage}/${fileName}.mp3`;

            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            currentAudio = new Audio(audioPath);
            currentAudio.play().catch(err => {
                console.log(`Audio clip missing for ${fileName}.mp3 in ./audio/${currentLanguage}/`);
            });

            lastSpokenItem = item;
        }
    }

    function setLanguage(lang) {
        currentLanguage = lang;
        langBtnLabel.textContent = currentLanguage === 'ur' ? 'Language: Urdu' : 'Language: English';
        transcriptOutput.textContent = `System language switched to ${currentLanguage === 'ur' ? 'Urdu' : 'English'}.`;
        lastSpokenItem = ''; 
    }

    langToggleBtn.addEventListener('click', () => {
        setLanguage(currentLanguage === 'en' ? 'ur' : 'en');
    });

    speechToggleBtn.addEventListener('click', () => {
        speechAudioEnabled = !speechAudioEnabled;
        speechBtnLabel.textContent = speechAudioEnabled ? 'Mute Audio' : 'Unmute Audio';
        speechToggleBtn.style.opacity = speechAudioEnabled ? '1' : '0.6';
        if (!speechAudioEnabled && currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
    });

    // Parse strictly for the 4 requested phrases
    function processParsedCommand(text) {
        const cleanText = text.toLowerCase().trim();
        const now = Date.now();

        if (cleanText.includes('english')) {
            if (currentLanguage !== 'en') setLanguage('en');
        } else if (cleanText.includes('urdu')) {
            if (currentLanguage !== 'ur') setLanguage('ur');
        } else if (cleanText.includes('switch') || cleanText.includes('language')) {
            if (now - lastToggleTime > 2000) {
                setLanguage(currentLanguage === 'en' ? 'ur' : 'en');
                lastToggleTime = now;
            }
        }
    }

    // Self-Healing Voice Command Loop (Bypasses network errors when offline)
    async function initOfflineVoiceCommands() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    processParsedCommand(event.results[i][0].transcript);
                }
            };

            recognition.onend = () => {
                setTimeout(() => {
                    try { recognition.start(); } catch (e) {}
                }, 250);
            };

            recognition.onerror = (e) => {
                // Instantly recover from speech engine disconnects offline
                if (e.error === 'network' || e.error === 'no-speech') {
                    setTimeout(() => {
                        try { recognition.start(); } catch (err) {}
                    }, 500);
                }
            };

            try { recognition.start(); } catch (e) {}
        }
    }

    toggleCameraBtn.addEventListener('click', () => {
        if (cameraActive) {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }
            videoFeed.srcObject = null;
            cameraActive = false;
            stopLiveDetection();
            updateStatus('Camera Disabled', '#6b7280');
            detectedObjectLabel.textContent = 'Camera Off';
            if (detectionConfidenceTag) detectionConfidenceTag.textContent = '0%';
        } else {
            initCamera();
        }
    });

    switchCameraBtn.addEventListener('click', async () => {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        cameraActive = false;
        await initCamera();
    });

    // Boot App
    loadDetectionModel();
});