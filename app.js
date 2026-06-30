const API_BASE = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events";

const speechStyles = {
  normal: { rate: 1.0, pitch: 1.0, volume: 1.0 },
  dramatic: { rate: 0.82, pitch: 0.85, volume: 1.0 },
  breakingNews: { rate: 1.12, pitch: 1.05, volume: 1.0 },
  bedtimeStory: { rate: 0.72, pitch: 0.9, volume: 0.85 },
  movieTrailer: { rate: 0.78, pitch: 0.75, volume: 1.0 }
};

const state = {
  events: [],
  currentIndex: -1,
  currentEvent: null,
  isLoading: true,
  isSpeaking: false,
  isSpeechCancelRequested: false,
  ttsSupported: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
};

const elements = {
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
  stopButton: document.querySelector("#stop-button")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  const today = new Date();
  const { displayDate, apiDate } = formatDates(today);

  elements.dateLabel.textContent = displayDate;
  elements.nextButton.addEventListener("click", showNextEvent);
  elements.speakButton.addEventListener("click", speakCurrentEvent);
  elements.stopButton.addEventListener("click", stopSpeech);
  window.addEventListener("beforeunload", stopSpeech);

  if (!state.ttsSupported) {
    elements.speechSupportMessage.hidden = false;
  }

  updateControls();
  loadEvents(apiDate);
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

function speakCurrentEvent() {
  if (!state.ttsSupported || !state.currentEvent || state.isLoading) {
    return;
  }

  const selectedStyle = speechStyles[elements.styleSelect.value] || speechStyles.normal;
  const year = state.currentEvent.year ?? "an unknown year";
  const text = state.currentEvent.text || "no event text is available";
  const speechText = `On this day in ${year}, ${text}`;
  const utterance = new SpeechSynthesisUtterance(speechText);

  utterance.rate = selectedStyle.rate;
  utterance.pitch = selectedStyle.pitch;
  utterance.volume = selectedStyle.volume;
  utterance.lang = "en-US";

  utterance.onstart = () => {
    state.isSpeaking = true;
    updateControls();
  };

  utterance.onend = () => {
    state.isSpeaking = false;
    state.isSpeechCancelRequested = false;
    updateControls();
  };

  utterance.onerror = () => {
    const wasCancelled = state.isSpeechCancelRequested;

    state.isSpeaking = false;
    state.isSpeechCancelRequested = false;

    if (!wasCancelled) {
      setStatus("Speech playback stopped unexpectedly.", "error");
    }

    updateControls();
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if (state.ttsSupported) {
    state.isSpeechCancelRequested = true;
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      state.isSpeechCancelRequested = false;
    }, 150);
  }

  state.isSpeaking = false;
  updateControls();
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

  elements.styleSelect.disabled = !state.ttsSupported;
  elements.nextButton.disabled = state.isLoading || state.events.length === 0;
  elements.speakButton.disabled = state.isLoading || !hasEvent || state.isSpeaking || !state.ttsSupported;
  elements.stopButton.disabled = !state.isSpeaking;
}
