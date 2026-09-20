# Daily agenda UI

Open **Day · Agenda** in the header. The panel reads the saved game-day slate and
existing decisions, prepares an absent day on request, submits the selected
candidate ID and database turn, then resolves through the canonical turn endpoint.
The UI displays evidence links, locks choices after selection, refreshes the map's
metrics through the city store, and reads the persisted outcome and resident
reactions. Reopening restores the latest completed daily outcome.

Database requirements: apply `20260919200000_game_day_vertical_slice.sql` and
`20260919210000_resident_outcome_evaluation.sql` after the earlier migrations.
Preparation uses the backend's ingested signals, provider configuration and
executable policy bindings. The server fills short news slates with distinct executable catalog policies,
clearly labeled Game policy. News evidence is never fabricated for these choices. Provider/configuration failures are shown in the panel.
