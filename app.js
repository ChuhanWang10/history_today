const API_BASE = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events";

const browserSpeechStyles = {
  Normal: { rate: 1.0, pitch: 1.0, volume: 1.0 },
  Dramatic: { rate: 0.82, pitch: 0.85, volume: 1.0 },
  "Breaking News": { rate: 1.12, pitch: 1.05, volume: 1.0 },
  "Bedtime Story": { rate: 0.72, pitch: 0.9, volume: 0.85 },
  "Movie Trailer": { rate: 0.78, pitch: 0.75, volume: 1.0 }
};

const COLOR_THEMES = [
  {
    id: "violet-night",
    name: "Violet Night"
  },
  {
    id: "magenta-wine",
    name: "Magenta Wine"
  },
  {
    id: "mint-noir",
    name: "Mint Noir"
  },
  {
    id: "olive-glow",
    name: "Olive Glow"
  }
];

const THEME_STORAGE_KEY = "thisDayWasWild.colorTheme";

let currentThemeIndex = 3;

const state = {
  events: [],
  currentIndex: -1,
  currentEvent: null,
  isLoading: true,
  isGeneratingAudio: false,
  isSpeaking: false,
  currentAudio: null,
  currentAudioUrl: null,
  ttsRequestId: 0,
  activeUtterance: null,
  isSpeechCancelRequested: false,
  browserTtsSupported: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
};

const elements = {
  themeToggle: document.querySelector("#themeToggle"),
  dateLabel: document.querySelector("#date-label"),
  statusMessage: document.querySelector("#status-message"),
  speechSupportMessage: document.querySelector("#speech-support-message"),
  eventPanel: document.querySelector(".event-panel"),
  eventYear: document.querySelector("#event-year"),
  eventText: document.querySelector("#event-text"),
  sourceLink: document.querySelector("#source-link"),
  styleSelect: document.querySelector("#speech-style"),
  nextButton: document.querySelector("#next-button"),
  speakButton: document.querySelector("#speak-button"),
  stopButton: document.querySelector("#stop-button"),
  fallbackButton: document.querySelector("#fallback-button")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  initializeColorTheme();

  const today = new Date();
  const { displayDate, apiDate } = formatDates(today);

  elements.dateLabel.textContent = displayDate;
  elements.nextButton.addEventListener("click", showNextEvent);
  elements.speakButton.addEventListener("click", speakCurrentEvent);
  elements.stopButton.addEventListener("click", stopSpeech);
  elements.fallbackButton.addEventListener("click", speakWithBrowserVoice);
  window.addEventListener("beforeunload", stopSpeech);

  updateControls();
  loadEvents(apiDate);
}

function getSavedThemeIndex() {
  let savedThemeId = null;

  try {
    savedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    return 3;
  }

  const savedIndex = COLOR_THEMES.findIndex((theme) => theme.id === savedThemeId);
  return savedIndex >= 0 ? savedIndex : 3;
}

function applyColorTheme(index) {
  const theme = COLOR_THEMES[index] || COLOR_THEMES[3];

  document.documentElement.dataset.theme = theme.id;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch (error) {
    // Storage can be unavailable in private browsing or restricted environments.
  }

  if (elements.themeToggle) {
    elements.themeToggle.textContent = `Color: ${theme.name}`;
    elements.themeToggle.setAttribute("aria-label", `Switch color theme. Current theme: ${theme.name}`);
    elements.themeToggle.title = `Current color theme: ${theme.name}`;
  }
}

function initializeColorTheme() {
  currentThemeIndex = getSavedThemeIndex();
  applyColorTheme(currentThemeIndex);

  if (!elements.themeToggle) {
    return;
  }

  elements.themeToggle.addEventListener("click", () => {
    currentThemeIndex = (currentThemeIndex + 1) % COLOR_THEMES.length;
    applyColorTheme(currentThemeIndex);
  });
}

function formatDates(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const displayDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric"
  });

  return {
    displayDate,
    apiDate: `${month}/${day}`
  };
}

async function loadEvents(apiDate) {
  setLoading(true);
  setStatus("Loading historical events...", "");

  try {
    const response = await fetch(`${API_BASE}/${apiDate}`);

    if (!response.ok) {
      throw new Error(`Wikimedia request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.events) || data.events.length === 0) {
      state.events = [];
      state.currentIndex = -1;
      state.currentEvent = null;
      showEmptyState();
      return;
    }

    state.events = data.events;
    showRandomEvent();
    setStatus("", "");
  } catch (error) {
    state.events = [];
    state.currentIndex = -1;
    state.currentEvent = null;
    showErrorState("Could not load historical events. Please try again later.");
    console.error(error);
  } finally {
    setLoading(false);
  }
}

function showRandomEvent() {
  if (state.events.length === 0) {
    showEmptyState();
    return;
  }

  const nextIndex = getRandomEventIndex();
  state.currentIndex = nextIndex;
  state.currentEvent = state.events[nextIndex];
  renderEvent(state.currentEvent);
}

function showNextEvent() {
  stopSpeech();
  hideFallbackOption();
  showRandomEvent();
}

function getRandomEventIndex() {
  if (state.events.length === 1) {
    return 0;
  }

  let nextIndex = state.currentIndex;

  while (nextIndex === state.currentIndex) {
    nextIndex = Math.floor(Math.random() * state.events.length);
  }

  return nextIndex;
}

function renderEvent(event) {
  elements.eventYear.textContent = event.year ?? "Unknown";
  elements.eventText.textContent = event.text || "No event text is available.";

  const sourceUrl = event.pages?.[0]?.content_urls?.desktop?.page;
  if (sourceUrl) {
    elements.sourceLink.href = sourceUrl;
    elements.sourceLink.hidden = false;
  } else {
    elements.sourceLink.removeAttribute("href");
    elements.sourceLink.hidden = true;
  }

  updateControls();
}

async function speakCurrentEvent() {
  if (!state.currentEvent || state.isLoading || state.isGeneratingAudio) {
    return;
  }

  stopSpeech();
  hideFallbackOption();

  const requestId = state.ttsRequestId + 1;
  state.ttsRequestId = requestId;
  state.isGeneratingAudio = true;
  setStatus("Generating audio...", "");
  updateControls();

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: buildSpeechText(),
        style: elements.styleSelect.value
      })
    });

    if (requestId !== state.ttsRequestId) {
      return;
    }

    if (!response.ok) {
      throw new Error(await getTtsErrorMessage(response));
    }

    const audioBlob = await response.blob();

    if (requestId !== state.ttsRequestId) {
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    state.currentAudio = audio;
    state.currentAudioUrl = audioUrl;

    audio.onended = () => {
      if (state.currentAudio !== audio) {
        return;
      }

      clearCurrentAudio(false);
      state.isSpeaking = false;
      setStatus("", "");
      updateControls();
    };

    audio.onerror = () => {
      if (state.currentAudio !== audio) {
        return;
      }

      clearCurrentAudio(false);
      state.isSpeaking = false;
      setStatus("Audio playback failed. Please try again.", "error");
      showFallbackOption();
      updateControls();
    };

    state.isGeneratingAudio = false;
    updateControls();

    await audio.play();

    if (requestId === state.ttsRequestId && state.currentAudio === audio) {
      state.isSpeaking = true;
      setStatus("", "");
      updateControls();
    }
  } catch (error) {
    if (requestId !== state.ttsRequestId) {
      return;
    }

    clearCurrentAudio(true);
    state.isGeneratingAudio = false;
    state.isSpeaking = false;
    setStatus(error.message || "Could not generate audio. Please try again.", "error");
    showFallbackOption();
    updateControls();
  }
}

async function getTtsErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error || "Could not generate audio. Please try again.";
  } catch (error) {
    return "Could not generate audio. Please try again.";
  }
}

function speakWithBrowserVoice() {
  if (!state.browserTtsSupported || !state.currentEvent || state.isLoading) {
    return;
  }

  stopSpeech();
  hideFallbackOption();

  const selectedStyle = browserSpeechStyles[elements.styleSelect.value] || browserSpeechStyles.Normal;
  const utterance = new SpeechSynthesisUtterance(buildSpeechText());

  utterance.rate = selectedStyle.rate;
  utterance.pitch = selectedStyle.pitch;
  utterance.volume = selectedStyle.volume;
  utterance.lang = "en-US";

  utterance.onstart = () => {
    if (state.activeUtterance !== utterance) {
      return;
    }

    state.isSpeaking = true;
    setStatus("", "");
    updateControls();
  };

  utterance.onend = () => {
    if (state.activeUtterance !== utterance) {
      return;
    }

    state.isSpeaking = false;
    state.activeUtterance = null;
    state.isSpeechCancelRequested = false;
    updateControls();
  };

  utterance.onerror = () => {
    if (state.activeUtterance !== utterance) {
      return;
    }

    const wasCancelled = state.isSpeechCancelRequested;

    state.isSpeaking = false;
    state.activeUtterance = null;
    state.isSpeechCancelRequested = false;

    if (!wasCancelled) {
      setStatus("Browser voice playback stopped unexpectedly.", "error");
    }

    updateControls();
  };

  state.activeUtterance = utterance;
  state.isSpeechCancelRequested = false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function buildSpeechText() {
  const year = state.currentEvent?.year ?? "an unknown year";
  const text = state.currentEvent?.text || "no event text is available";

  return `On this day in ${year}, ${text}`;
}

function stopSpeech() {
  state.ttsRequestId += 1;
  state.isGeneratingAudio = false;
  state.isSpeaking = false;
  clearCurrentAudio(true);

  if (state.browserTtsSupported) {
    state.isSpeechCancelRequested = true;
    state.activeUtterance = null;
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      state.isSpeechCancelRequested = false;
    }, 150);
  }

  updateControls();
}

function clearCurrentAudio(shouldPause) {
  if (state.currentAudio) {
    state.currentAudio.onended = null;
    state.currentAudio.onerror = null;

    if (shouldPause) {
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
    }

    state.currentAudio.src = "";
  }

  if (state.currentAudioUrl) {
    URL.revokeObjectURL(state.currentAudioUrl);
  }

  state.currentAudio = null;
  state.currentAudioUrl = null;
}

function showFallbackOption() {
  if (state.browserTtsSupported) {
    elements.fallbackButton.hidden = false;
    return;
  }

  elements.speechSupportMessage.hidden = false;
}

function hideFallbackOption() {
  elements.fallbackButton.hidden = true;
  elements.speechSupportMessage.hidden = true;
}

function showEmptyState() {
  elements.eventYear.textContent = "----";
  elements.eventText.textContent = "No historical events were found for today.";
  elements.sourceLink.removeAttribute("href");
  elements.sourceLink.hidden = true;
  setStatus("No events were returned by Wikipedia for today.", "error");
  updateControls();
}

function showErrorState(message) {
  elements.eventYear.textContent = "----";
  elements.eventText.textContent = "History is unavailable right now.";
  elements.sourceLink.removeAttribute("href");
  elements.sourceLink.hidden = true;
  setStatus(message, "error");
  updateControls();
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  elements.eventPanel.classList.toggle("is-loading", isLoading);
  updateControls();
}

function setStatus(message, type) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", type === "error");
}

function updateControls() {
  const hasEvent = Boolean(state.currentEvent);

  elements.nextButton.disabled = state.isLoading || state.events.length === 0;
  elements.speakButton.disabled = state.isLoading || !hasEvent || state.isGeneratingAudio;
  elements.stopButton.disabled = !state.isSpeaking;
}
