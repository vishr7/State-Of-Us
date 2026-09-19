# Synthetic resident sample

Source: [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA), by NVIDIA, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

This is a transformed convenience sample of the first 100 unique adult personas in train order. These are synthetic people, not actual residents or a statistically representative Pittsburgh sample. The checked-in JSON records the import timestamp and source UUIDs. Names are extracted from the narrative because the dataset has no separate name field; a numbered name is used if extraction fails. Interests/skills are limited to six entries. Age, occupation, education, source location and persona narrative come from the source dataset.

Income, housing, household size, neighborhood, commute, policy sensitivities, mood, trust, dialogue, and sprite colors are deterministic game defaults, not dataset observations. No protected attributes are used to assign income, neighborhood, or appearance. The dataset supplies text, not sprite images. The 100 residents represent the visible sample; the city population counter still represents the whole simulated city. Existing aggregate sentiment groups remain separate game fixtures.

## Refresh

```sh
python3 scripts/import-personas.py
```

Uses the Hugging Face Dataset Viewer API, fetching small batches instead of the whole dataset. The default public endpoint currently works without login. If access requires authentication, set `HF_TOKEN` in your shell (never put it in client code).

To use the Python `datasets` library instead:

```sh
python3 -m pip install datasets
hf auth login
python3 scripts/import-personas.py --backend datasets
```

The datasets backend uses `load_dataset(..., split='train', streaming=True)` and stops after 100 adult records. Neither backend downloads the full million-row dataset. Import failures leave the previous snapshot intact. The game runs offline against the checked-in subset.

## In game

Press Play to animate residents; Pause freezes their positions. Click a walker or use “Explore a resident” on the map to open their profile. Walking routes retrace connected street tiles and never teleport across water/buildings. Cosmetics extend the map's existing canvas pedestrians. Profiles show source attribution and distinguish source traits from game defaults. Policy reactions are still the game's simulated rules, not live Nemotron inference.

```sh
node --test scripts/test-personas.cjs
```
