# APIGarden v1.9.0

## Voice-to-flight browser agent improvements
- Improved parsing for natural commands such as “go to Biman website and search available flights from Dhaka to Chittagong”.
- Explicit `from X to Y` route parsing prevents the website instruction from being mistaken for the origin.
- Added recognized travel-site aliases for Trip.com, Biman Bangladesh Airlines, US-Bangla Airlines and NOVOAIR.
- The agent can open/select Flights, locate semantic origin/destination controls, fill autocomplete values, and submit the real form.
- Full-page navigation is followed by a verification pass that inspects the final result page instead of blindly repeating the search.
- JSON status now distinguishes success, search submitted/attempted, and needs-user-action.
- The agent does not fabricate a missing travel date; it preserves the website's existing/default date when no date was spoken.
