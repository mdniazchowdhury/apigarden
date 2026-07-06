# APIGarden Secure AI Version — OpenRouter

This version keeps your existing APIGarden frontend design, but connects the AI parts to OpenRouter safely through a backend server.

## What changed

- The API key is **not inside `index.html`**.
- The frontend calls `http://localhost:3000/api/run-api`.
- `server.js` reads your OpenRouter key from `.env` and calls `https://openrouter.ai/api/v1/chat/completions`.
- Create New API, My APIs, Grammar Correction, and PDF Q&A use the backend AI when it is running.
- Currency and Weather still use free keyless public APIs.
- A Chrome Extension `manifest.json` is included for Load Unpacked demo use.

## Where to paste your API key

1. Rename `.env.example` to `.env`.
2. Open `.env`.
3. Paste your key here:

```env
OPENROUTER_API_KEY=PASTE_HERE_YOUR_API_KEY
OPENROUTER_MODEL=openai/gpt-oss-120b:free
PORT=3000
APP_URL=http://localhost:3000
```

Do **not** paste the key inside `index.html`.

## Setup

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000/index.html
```

## Chrome Extension demo

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on Developer Mode.
4. Click **Load unpacked**.
5. Select this folder.
6. Keep the backend running with `npm start`.

## Can it create any API?

For your demo, yes: the user can describe APIs like:

- Movie recommender
- Chocolate flavor recommender
- Caption generator
- Email writer
- Grammar checker
- Study-note summarizer
- PDF Q&A assistant

The answer quality depends on the model and the information you provide. For live prices, stock, current movie showtimes, or real product availability, you need a real database or live external API.


## Important deployment fix
This version automatically uses the same website origin for backend API calls. That means on Render it calls `https://your-site.onrender.com/api/...`, not `http://localhost:3000/api/...`. Currency conversion also goes through the backend so USD to BDT works better.
