# APIGarden v1.8.0 — Autonomous Browser Agent

- Added autonomous multi-step browser execution for natural-language Voice API commands.
- Added Trip.com / flight-intent recognition.
- For flight goals, APIGarden opens the real website, analyzes visible controls, selects Flights, identifies origin/destination fields, fills autocomplete controls, searches, waits for navigation/SPA updates, and verifies/extracts visible final results.
- Added a second verification pass after navigation so JSON is generated from the final page rather than the starting page whenever possible.
- Added structured `agent`, `travel`, `status`, `steps`, and live result information to JSON outcomes.
- Website Voice API uses the same extension automation bridge and now waits longer for multi-step workflows.
- Existing ecommerce voice search, Save API, My APIs, and Download JSON behavior remains available.

## Important limitations

Autonomous web navigation is best-effort. A website can block automation, change its DOM, require CAPTCHA/login, or require information the user did not provide. APIGarden does not invent missing live data. If it cannot verify the requested final result, the JSON reports the attempted agent state instead of fabricating results.
