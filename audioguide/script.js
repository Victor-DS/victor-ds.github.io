const API_BASE_URL = 'https://p60s08iev4.execute-api.us-east-1.amazonaws.com/prod';

const cameraButton = document.getElementById('camera-button');
const fileInput = document.getElementById('file-input');
const toast = document.getElementById('toast');
const homeScreen = document.getElementById('home-screen');
const artworkScreen = document.getElementById('artwork-screen');
const backButton = document.getElementById('back-button');
const loading = document.getElementById('loading');

const artworkImage = document.getElementById('artwork-image');
const artworkTitle = document.getElementById('artwork-title');
const artworkArtist = document.getElementById('artwork-artist');
const artworkDate = document.getElementById('artwork-date');
const languageSelect = document.getElementById('language-select');
const playPauseButton = document.getElementById('play-pause-button');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const timeDisplay = document.getElementById('time-display');
const audioElement = document.getElementById('audio-element');
const sourceLink = document.getElementById('source-link');

let currentArtworkData = null;

// Show toast notification
function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Format time in MM:SS format
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update time display
function updateTimeDisplay() {
  const current = audioElement.currentTime || 0;
  const duration = audioElement.duration || 0;
  timeDisplay.textContent = `${formatTime(current)}/${formatTime(duration)}`;
}

// Compress image before sending to API
function compressImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const img = new Image();
      
      img.onload = function() {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg', // Use JPEG for better compression
          quality
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

// Call API with image
async function callAPI(imageFile) {
  return new Promise(async (resolve, reject) => {
    try {
      // Compress the image first
      const compressedBlob = await compressImage(imageFile);
      
      // Convert compressed blob to base64
      const reader = new FileReader();
      
      reader.onload = async function(e) {
        try {
          // Remove data URI prefix if present
          const base64Image = e.target.result.split(',')[1] || e.target.result;
          
          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          try {
            const response = await fetch(`${API_BASE_URL}/ngl/public`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image: base64Image
              }),
              signal: controller.signal,
              mode: 'cors',
              credentials: 'omit'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.message || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            resolve(data);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            
            // Handle specific error types
            if (fetchError.name === 'AbortError') {
              throw new Error('Request timeout. Please check your connection and try again.');
            } else if (fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
              // Network error or CORS issue
              throw new Error('Network error. Please check your internet connection. If using Brave browser, try disabling shields for this site.');
            } else {
              throw fetchError;
            }
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read compressed image'));
      reader.readAsDataURL(compressedBlob);
    } catch (error) {
      reject(error);
    }
  });
}

// Display artwork information
function displayArtwork(data) {
  currentArtworkData = data;
  
  artworkImage.src = data.painting_url;
  artworkTitle.textContent = data.title;
  artworkArtist.textContent = data.artist;
  artworkDate.textContent = data.date;
  
  // Handle source link
  if (data.source && data.source !== 'Unknown') {
    sourceLink.href = data.source;
    sourceLink.style.display = 'block';
  } else {
    sourceLink.style.display = 'none';
  }
  
  // Show artwork screen, hide home screen
  homeScreen.classList.add('hidden');
  artworkScreen.classList.add('show');
  
  // Push state to history so back button/swipe goes back to home screen
  history.pushState({ screen: 'artwork' }, '', '#artwork');
  
  // Load default language (English)
  loadAudio('en');
}

// Load audio for selected language
function loadAudio(language) {
  const audioKey = `audio_${language}_url`;
  const audioUrl = currentArtworkData[audioKey];
  
  if (!audioUrl || audioUrl === 'Unknown') {
    showToast(`Audio not available in ${languageSelect.options[languageSelect.selectedIndex].text}`);
    audioElement.pause();
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    return;
  }
  
  audioElement.src = audioUrl;
  audioElement.load();
  timeDisplay.textContent = '0:00/0:00';
}

// Toggle play/pause
function togglePlayPause() {
  if (audioElement.paused) {
    audioElement.play().catch(error => {
      showToast('Error playing audio');
      console.error('Audio play error:', error);
    });
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  } else {
    audioElement.pause();
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
}

// Handle file selection
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Show loading
  loading.classList.add('show');
  
  try {
    const artworkData = await callAPI(file);
    displayArtwork(artworkData);
  } catch (error) {
    console.error('Error:', error);
    let errorMessage = 'Failed to identify artwork';
    
    if (error.message.includes('404') || error.message.includes('No similar artwork')) {
      errorMessage = 'No artwork found. Please try another photo.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Too many requests. Please try again in a moment.';
    } else if (error.message.includes('Network error') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
      // Check if Brave browser
      const isBrave = navigator.brave && (await navigator.brave.isBrave().catch(() => false));
      if (isBrave) {
        errorMessage = 'Network blocked. Please disable Brave Shields for this site and try again.';
      } else {
        errorMessage = error.message || 'Network error. Please check your connection.';
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    showToast(errorMessage, 6000);
  } finally {
    loading.classList.remove('show');
    // Reset file input
    fileInput.value = '';
  }
}

// Update UI to show home screen
function showHomeScreen() {
  artworkScreen.classList.remove('show');
  homeScreen.classList.remove('hidden');
  audioElement.pause();
  audioElement.src = '';
  currentArtworkData = null;
  playIcon.style.display = 'block';
  pauseIcon.style.display = 'none';
  timeDisplay.textContent = '0:00/0:00';
  sourceLink.style.display = 'none';
  sourceLink.href = '#';
}

// Go back to home screen (called from back button click)
function goBack() {
  // Use history.back() to go back in history
  // This will trigger the popstate event, which will handle the UI update
  history.back();
}

// Handle browser back button/swipe gesture
window.addEventListener('popstate', (event) => {
  // When user goes back (via gesture or back button), show home screen
  if (artworkScreen.classList.contains('show')) {
    showHomeScreen();
  }
});

// Initialize history state on page load
window.addEventListener('load', () => {
  // Remove hash if present
  if (window.location.hash) {
    window.location.hash = '';
  }
  
  // Initialize with home state if no state exists
  if (!history.state) {
    history.replaceState({ screen: 'home' }, '', window.location.pathname);
  }
  
  // Ensure home screen is shown on initial load
  homeScreen.classList.remove('hidden');
  artworkScreen.classList.remove('show');
});

// Event listeners
cameraButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

backButton.addEventListener('click', goBack);

playPauseButton.addEventListener('click', togglePlayPause);

languageSelect.addEventListener('change', (e) => {
  const wasPlaying = !audioElement.paused;
  audioElement.pause();
  playIcon.style.display = 'block';
  pauseIcon.style.display = 'none';
  
  loadAudio(e.target.value);
  
  if (wasPlaying) {
    audioElement.addEventListener('loadeddata', () => {
      audioElement.play().catch(error => {
        console.error('Audio play error:', error);
      });
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    }, { once: true });
  }
});

// Audio event listeners
audioElement.addEventListener('timeupdate', updateTimeDisplay);
audioElement.addEventListener('loadedmetadata', updateTimeDisplay);
audioElement.addEventListener('ended', () => {
  playIcon.style.display = 'block';
  pauseIcon.style.display = 'none';
  audioElement.currentTime = 0;
  updateTimeDisplay();
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  document.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});
