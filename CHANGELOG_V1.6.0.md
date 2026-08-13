# APIGarden v1.6.0 Voice API changes

- Added a dedicated **Voice API** tab with a microphone-first interface that is visually distinct from the reference screenshots.
- Live speech-to-text transcript appears while speaking and remains editable before analysis.
- Recording uses continuous recognition and automatically restarts after browser speech-session endings until **Stop Recording** is explicitly selected.
- Voice intent detection identifies supported website names/domains, product query, and BDT price range.
- Bata Bangladesh, Walton, Daraz Bangladesh, Pickaboo, and Rokomari have built-in routing templates; explicit domains are also supported.
- **Run API** opens the detected site search in a new active tab, applies the spoken price range visually, and captures live visible product data.
- Run results are persisted by the background service worker, so closing the extension popup when the website opens does not lose the tested result.
- After reopening the extension, the tested voice draft shows **Save API** and **Download JSON**.
- Saved voice APIs appear in **My APIs**, can be run again, and retain a downloadable live JSON outcome.
- JSON includes API name, description, query, status, source URL, page title, result count, product results, BDT filters, voice metadata, generation time, and note.
