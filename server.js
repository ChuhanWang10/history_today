const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ELEVENLABS_TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

const ELEVENLABS_STYLE_SETTINGS = {
  Normal: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true
  },
  Dramatic: {
    stability: 0.35,
    similarity_boost: 0.8,
    style: 0.55,
    use_speaker_boost: true
  },
  "Breaking News": {
    stability: 0.42,
    similarity_boost: 0.75,
    style: 0.35,
    use_speaker_boost: true
  },
  "Bedtime Story": {
    stability: 0.7,
    similarity_boost: 0.65,
    style: 0.2,
    use_speaker_boost: true
  },
  "Movie Trailer": {
    stability: 0.3,
    similarity_boost: 0.85,
    style: 0.75,
    use_speaker_boost: true
  }
};

app.use(express.json({ limit: "20kb" }));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }

  return next(error);
});

app.use(express.static(__dirname));

app.post("/api/tts", async (req, res) => {
  const { text, style } = req.body || {};
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (!trimmedText) {
    return res.status(400).json({ error: "Text is required and must be a non-empty string." });
  }

  if (trimmedText.length > 1000) {
    return res.status(400).json({ error: "Text must be 1000 characters or fewer." });
  }

  if (!Object.prototype.hasOwnProperty.call(ELEVENLABS_STYLE_SETTINGS, style)) {
    return res.status(400).json({
      error: "Style must be one of: Normal, Dramatic, Breaking News, Bedtime Story, Movie Trailer."
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_ELEVENLABS_MODEL_ID;

  if (!apiKey) {
    return res.status(500).json({ error: "ElevenLabs API key is not configured on the server." });
  }

  if (!voiceId) {
    return res.status(500).json({ error: "ElevenLabs voice ID is not configured on the server." });
  }

  try {
    const elevenLabsResponse = await fetch(getElevenLabsTtsUrl(voiceId), {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text: trimmedText,
        model_id: modelId,
        voice_settings: ELEVENLABS_STYLE_SETTINGS[style]
      })
    });

    if (!elevenLabsResponse.ok) {
      const detail = await readElevenLabsError(elevenLabsResponse);
      console.error("ElevenLabs speech API error", {
        status: elevenLabsResponse.status,
        statusText: elevenLabsResponse.statusText,
        contentType: elevenLabsResponse.headers.get("content-type") || "",
        detail
      });

      return res.status(502).json({ error: "Could not generate audio right now. Please try again later." });
    }

    const contentType = elevenLabsResponse.headers.get("content-type") || "";

    if (!contentType.includes("audio/") && !contentType.includes("application/octet-stream")) {
      const detail = await readElevenLabsError(elevenLabsResponse);
      console.error("Unexpected ElevenLabs response type", {
        status: elevenLabsResponse.status,
        statusText: elevenLabsResponse.statusText,
        contentType,
        detail
      });

      return res.status(502).json({ error: "Could not generate audio right now. Please try again later." });
    }

    const audioBuffer = Buffer.from(await elevenLabsResponse.arrayBuffer());

    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audioBuffer);
  } catch (error) {
    console.error("TTS request failed", error);
    return res.status(502).json({ error: "Could not generate audio right now. Please try again later." });
  }
});

function getElevenLabsTtsUrl(voiceId) {
  const encodedVoiceId = encodeURIComponent(voiceId);
  return `${ELEVENLABS_TTS_BASE_URL}/${encodedVoiceId}?output_format=mp3_44100_128`;
}

async function readElevenLabsError(response) {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await response.json();
      return JSON.stringify({ error: body.error?.message || body.error || body }).slice(0, 500);
    }

    const body = await response.text();
    return body.slice(0, 500);
  } catch (error) {
    return "Unable to read ElevenLabs error body.";
  }
}

app.listen(PORT, () => {
  console.log(`History today is running at http://localhost:${PORT}`);
});
