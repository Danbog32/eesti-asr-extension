chrome.action.setPopup({ popup: "popup.html" });

// Add a mapping to keep track of tabs we're monitoring for audio
const tabsWaitingForAudio = new Map();

// Add these variables near the top of the file
let inactivityTimeout = null;
const INACTIVITY_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute

let isVideoPaused = false;
let isTabHidden = false;

function openOptions() {
  return new Promise((resolve) => {
    chrome.tabs.create(
      {
        pinned: true,
        active: false, // open in background
        url: `chrome-extension://${chrome.runtime.id}/options.html`,
      },
      (tab) => {
        // Wait until the options tab is fully loaded.
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(tab);
          }
        });
      }
    );
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId).then(resolve).catch(resolve);
  });
}

function executeScript(tabId, file) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [file],
      },
      () => {
        resolve();
      }
    );
  });
}

function sendMessageToTab(tabId, data) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, data, (res) => {
      resolve(res);
    });
  });
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve(value);
    });
  });
}

async function startRecognizerTab() {
  // Retrieve the current active tab.
  const [currentTab] = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );
  console.log("Current Tab:", currentTab);

  // Remove any previously stored options tab.
  const oldOptionTabId = await getStorage("optionTabId");
  if (oldOptionTabId) {
    await removeTab(oldOptionTabId);
  }

  // Proceed only if the current tab is audible, otherwise wait for audio
  if (currentTab && currentTab.audible) {
    console.log("Tab has audio, starting transcription immediately");
    await initializeTranscription(currentTab);
  } else if (currentTab) {
    console.log(
      "Tab is not audible. Setting up listener for when audio starts."
    );

    // Store the tab ID in our tracking map
    tabsWaitingForAudio.set(currentTab.id, true);

    // Make a visual indication that we're waiting for audio
    chrome.action.setBadgeText({ text: "wait", tabId: currentTab.id });
    chrome.action.setBadgeBackgroundColor({
      color: "#FFA500",
      tabId: currentTab.id,
    });

    // Add listener for tab updates if not already listening
    if (!chrome.tabs.onUpdated.hasListener(onTabUpdated)) {
      chrome.tabs.onUpdated.addListener(onTabUpdated);
    }

    // Notify the user
    await sendMessageToTab(currentTab.id, {
      type: "WAITING_FOR_AUDIO",
    });
  }
}

// Tab update listener to detect when audio becomes available
function onTabUpdated(tabId, changeInfo, tab) {
  // Check if this is a tab we're monitoring and it now has audio
  if (tabsWaitingForAudio.has(tabId) && changeInfo.audible === true) {
    console.log(`Tab ${tabId} now has audio, starting transcription`);

    // Remove from waiting list
    tabsWaitingForAudio.delete(tabId);

    // Clear the badge
    chrome.action.setBadgeText({ text: "", tabId });

    // Start transcription
    initializeTranscription(tab);

    // If no more tabs are waiting, remove the listener
    if (tabsWaitingForAudio.size === 0) {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    }
  }
}

// Function to initialize transcription (extracted from startRecognizerTab)
async function initializeTranscription(tab) {
  await setStorage("currentTabId", tab.id);
  await executeScript(tab.id, "content.js");
  // Optionally, insert CSS here.
  await sleep(500);

  // Always open a new options (recording) tab and wait for it to load.
  const optionTab = await openOptions();
  console.log("New options tab created", optionTab);
  await setStorage("optionTabId", optionTab.id);
  await sleep(500);

  // Send the START_RECORD message to the new options tab.
  await sendMessageToTab(optionTab.id, {
    type: "START_RECORD",
    data: { currentTabId: tab.id },
  });
}

// Modify stopRecognizerTab to also clear the inactivity timer

async function stopRecognizerTab() {
  // Clear any inactivity timer when stopping manually
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }

  // Get the current active tab
  const [currentTab] = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );

  // If we're waiting for this tab to get audio, stop waiting
  if (currentTab && tabsWaitingForAudio.has(currentTab.id)) {
    tabsWaitingForAudio.delete(currentTab.id);
    chrome.action.setBadgeText({ text: "", tabId: currentTab.id });

    // If no more tabs are waiting, remove the listener
    if (tabsWaitingForAudio.size === 0) {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    }
  }

  // Existing code to stop recording...
  const optionTabId = await getStorage("optionTabId");
  if (optionTabId) {
    // Send the STOP_RECORD message to the options tab.
    await sendMessageToTab(optionTabId, { type: "STOP_RECORD" });

    // Wait a short time for the stop operation to complete
    await sleep(500);

    // Close the options tab
    try {
      await removeTab(optionTabId);
      console.log("Options tab closed successfully");
      // Clear the stored option tab ID since it's now closed
      await setStorage("optionTabId", null);
    } catch (error) {
      console.error("Error closing options tab:", error);
    }
  } else {
    console.error("No option tab found to stop recording.");
  }
}

async function resetRecognizer() {
  const optionTabId = await getStorage("optionTabId");
  if (optionTabId) {
    // Send the RESET_RECOGNIZER message to the options tab
    await sendMessageToTab(optionTabId, { type: "RESET_RECOGNIZER" });
  } else {
    console.error("No option tab found to reset recognizer.");
  }
}

// Update the toggleRecognizerTab function

async function toggleRecognizerTab() {
  const transcriptionState = await getStorage("transcriptionState");
  if (transcriptionState) {
    // Recording is active; stop it.
    await stopRecognizerTab();

    // Clear any inactivity timeout when stopping
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = null;
    }

    return { status: "stopped" };
  } else {
    // Not recording; start it.
    await startRecognizerTab();

    // Set up inactivity monitoring
    await setupInactivityMonitoring();

    // Reset the state trackers
    isVideoPaused = false;
    isTabHidden = false;

    return { status: "started" };
  }
}

// Add this after the toggleRecognizerTab function
async function setupInactivityMonitoring() {
  const currentTabId = await getStorage("currentTabId");
  if (!currentTabId) return;

  // Execute script to monitor video state and visibility in the content tab
  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    function: monitorVideoAndVisibility,
  });
}

// Function that will run in the content script
function monitorVideoAndVisibility() {
  // Don't add duplicate listeners
  if (window.inactivityMonitorActive) return;
  window.inactivityMonitorActive = true;

  // Monitor page visibility
  document.addEventListener("visibilitychange", () => {
    chrome.runtime.sendMessage({
      type: "VISIBILITY_CHANGE",
      isHidden: document.hidden,
    });
  });

  // Monitor all video elements
  function setupVideoListeners() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      // Remove any existing listeners first
      video.removeEventListener("play", reportVideoPlay);
      video.removeEventListener("pause", reportVideoPause);

      // Add fresh listeners
      video.addEventListener("play", reportVideoPlay);
      video.addEventListener("pause", reportVideoPause);

      // Report initial state if the video exists
      if (video.paused) {
        reportVideoPause();
      } else {
        reportVideoPlay();
      }
    });
  }

  function reportVideoPlay() {
    chrome.runtime.sendMessage({ type: "VIDEO_STATE_CHANGE", isPaused: false });
  }

  function reportVideoPause() {
    chrome.runtime.sendMessage({ type: "VIDEO_STATE_CHANGE", isPaused: true });
  }

  // Set up initial listeners
  setupVideoListeners();

  // Set up MutationObserver to catch dynamically added videos
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        setupVideoListeners();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Report initial visibility state
  chrome.runtime.sendMessage({
    type: "VISIBILITY_CHANGE",
    isHidden: document.hidden,
  });
}

// Listen for messages from the popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TOGGLE_RECORD_FROM_POPUP") {
    // Must return true to indicate we'll send a response asynchronously
    toggleRecognizerTab()
      .then((response) => {
        sendResponse(response);
        // Update the storage to match the current state
        chrome.storage.local.set({
          transcriptionState: response.status === "started",
        });
      })
      .catch((error) => {
        console.error("Error in toggleRecognizerTab:", error);
        sendResponse({ status: "error", message: error.toString() });
      });
    return true; // This is important - tells Chrome we'll respond asynchronously
  } else if (request.type === "START_RECORD_FROM_POPUP") {
    startRecognizerTab().then(() => sendResponse({ status: "started" }));
    return true;
  } else if (request.type === "STOP_RECORD_FROM_POPUP") {
    stopRecognizerTab().then(() => sendResponse({ status: "stopped" }));
    return true;
  } else if (request.type === "RESET_RECOGNIZER") {
    resetRecognizer();
    sendResponse({ status: "reset" });
  } else if (request.type === "RESET_TRANSCRIPTION_STATE") {
    resetTranscriptionState();
    sendResponse({ status: "state_reset" });
  } else if (request.type === "VISIBILITY_CHANGE") {
    handleVisibilityChange(request.isHidden);
    sendResponse({ status: "handled" });
    return true;
  } else if (request.type === "VIDEO_STATE_CHANGE") {
    handleVideoStateChange(request.isPaused);
    sendResponse({ status: "handled" });
    return true;
  }
});

// Add these new handler functions
async function handleVisibilityChange(isHidden) {
  const transcriptionState = await getStorage("transcriptionState");
  if (!transcriptionState) return; // Not recording, nothing to do

  isTabHidden = isHidden;

  // Update inactivity tracking
  if (isHidden || isVideoPaused) {
    startInactivityTimer(
      "Tab visibility: " +
        (isHidden ? "hidden" : "visible") +
        ", Video: " +
        (isVideoPaused ? "paused" : "playing")
    );
  } else {
    // Tab is visible and video is playing, clear the timer
    clearInactivityTimer();
  }
}

async function handleVideoStateChange(isPaused) {
  const transcriptionState = await getStorage("transcriptionState");
  if (!transcriptionState) return; // Not recording, nothing to do

  isVideoPaused = isPaused;

  // Update inactivity tracking
  if (isPaused || isTabHidden) {
    startInactivityTimer(
      "Tab visibility: " +
        (isTabHidden ? "hidden" : "visible") +
        ", Video: " +
        (isPaused ? "paused" : "playing")
    );
  } else {
    // Tab is visible and video is playing, clear the timer
    clearInactivityTimer();
  }

  // If video is paused, update badge to indicate state
  const currentTabId = await getStorage("currentTabId");
  if (currentTabId) {
    if (isPaused) {
      chrome.action.setBadgeText({ text: "⏸️", tabId: currentTabId });
      chrome.action.setBadgeBackgroundColor({
        color: "#FFA500",
        tabId: currentTabId,
      });
    } else {
      chrome.action.setBadgeText({ text: "", tabId: currentTabId });
    }
  }
}

// Add these functions to manage the inactivity timer

function startInactivityTimer(reason) {
  // Clear any existing timer first
  clearInactivityTimer();

  console.log(`Starting inactivity timer. Reason: ${reason}`);

  // Create a new timer
  inactivityTimeout = setTimeout(async () => {
    // Stop the recognizer
    await stopRecognizerTab();

    // Reset the state
    inactivityTimeout = null;
  }, INACTIVITY_TIMEOUT_MS);
}

function clearInactivityTimer() {
  if (inactivityTimeout) {
    console.log("Clearing inactivity timer - activity detected");
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }
}

// Update resetTranscriptionState to clear inactivity timers

async function resetTranscriptionState() {
  console.log("Resetting transcription state to false");

  // Clear any inactivity timer
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }

  // Rest of your existing resetTranscriptionState code...
  // ...
}
