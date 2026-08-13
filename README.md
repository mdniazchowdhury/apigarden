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

## Activity Recorder (v1.4.0)

1. Log in to the Chrome extension and open the **Recorder** tab.
2. Select **Start recording**. The extension badge displays **REC**.
3. The popup may be closed; recording continues in the Manifest V3 background service worker.
4. Browse, search, type, submit forms, and open result pages normally.
5. Reopen the extension, return to **Recorder**, and select **Stop and create API**.
6. The generated item appears under **My APIs**. Select **Run API** to open the captured final result URL in a new Chrome tab.

The recorder captures navigation, clicks, non-password input changes, Enter key submissions, and form submissions. Password values are never recorded.


## JSON outcome files

Every API result can now be exported as a `.json` file.

- Website: Run an API from **My APIs**, then select **Download JSON** below the result.
- Extension: Run a recorded API, then select **Download JSON** beside that API.
- Submission examples are included in the `json-outcomes/` folder for Water Heater, Zebra, and Colorful Fridge.

Each JSON file contains the API name, query, outcome, status, result URL (when applicable), and generation time.

## Live JSON product extraction
Recorded APIs now attempt to extract visible product information from the final opened page. The downloaded JSON may include `product name`, `live price`, `product image`, and `product url`. Values are taken from the live webpage DOM; the extension does not invent missing data. Extraction success depends on the target website's HTML structure and whether the products are visible after the page loads.

## Walton extraction fix (v1.5.2)
Walton search pages use plain prices such as `9,490` and a product layout that differs from common ecommerce cards. Version 1.5.2 adds a Walton-specific extractor and recognises comma-formatted prices even when no currency symbol is displayed. Reload the unpacked extension and make a new recording after updating.


## Version 1.5.3
Exported `live price` values now always use the Bangladeshi Taka symbol in the format `৳ 9,490`, including Walton pages that show a plain numeric price.


## Create API by Voice (v1.6.0)

The Chrome extension now includes a **Voice API** tab.

1. Select **Start Recording** and speak naturally. The live transcript appears underneath and can be edited.
2. Recording stays active until **Stop Recording** is selected. If Chrome ends the speech session because of silence, APIGarden automatically restarts it while the Voice API is still in listening mode.
3. Select **Analyze & Create API**. APIGarden detects a website, product/search phrase, and an optional BDT price range.
4. Select **Run API**. A new tab opens on the detected website search. APIGarden applies the spoken price range visually and extracts visible product name, live price, image, URL, and availability where the page exposes them.
5. After testing, select **Save API** to put it in **My APIs**. Saved voice APIs can be run again.
6. Select **Download JSON** to export the last tested live outcome.

Example command: `Go to Bata website and create an API for shoes from 0 to 3000 taka.`

Built-in website routing is included for Bata Bangladesh, Walton, Daraz Bangladesh, Pickaboo, and Rokomari. Explicit domains such as `example.com` are also accepted; for other spoken website names APIGarden makes a best-effort `.com` search URL.

## Autonomous Browser Agent (v1.8.0)

Voice/Text API commands can now describe a multi-step website goal, not only a direct product filter. Example:

`Go to Trip.com, select Flights, enter Dhaka to Saudi Arabia, search, and show all available flights.`

For recognized travel instructions APIGarden opens the real site and performs a best-effort semantic workflow: inspect visible controls, click the Flights section, identify From/To fields from labels/ARIA/placeholder/nearby text, fill autocomplete suggestions, submit the search, wait for navigation, verify the destination page, and extract visible result cards into JSON.

If a date was not supplied, APIGarden preserves a website-provided default date where available rather than silently inventing a date. CAPTCHA, login gates, unsupported widgets, and ambiguous/missing required information may still require user action.
