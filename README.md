# This Day Was Wild

A small static web app that shows a random historical event from today and reads it aloud with the browser's built-in text-to-speech.

## Run

Open `index.html` in a browser. No install, build step, backend, database, or dependencies are required.

## Data

Historical events are loaded from Wikimedia's English "On this day" endpoint:

`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{MM}/{DD}`

## Notes

Text-to-speech uses the browser Web Speech API. Browsers that do not support it will still show events, but speech controls will be disabled.
