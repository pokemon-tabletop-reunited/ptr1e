

import json
import os
import argparse
from pathlib import Path

from pokeapi_client import get_species


def load_overrides():
  base = Path(__file__).parent / 'data'
  starters = {}
  paradox = []
  try:
    with open(base / 'starters.json', 'r', encoding='utf-8') as f:
      starters = json.load(f)
  except Exception:
    starters = {}
  try:
    with open(base / 'paradox.json', 'r', encoding='utf-8') as f:
      paradox = json.load(f)
  except Exception:
    paradox = []
  return starters, paradox


def normalize_name_for_lookup(data):
  system = data.get('system', {})
  # prefer numeric dex entry
  number = system.get('number') or system.get('dex') or system.get('dexnumber')
  if number:
    return number
  # fallback to slug or name
  slug = system.get('slug') or system.get('name')
  if slug:
    return slug.lower().replace(' ', '-')
  # last resort: filename-ish id in _id
  return data.get('_id')


def calculate_keywords(data, cache_dir=None, starters_override=None, paradox_override=None):
  keywords = set()
  starters_override = starters_override or {}
  paradox_override = paradox_override or []

  key = normalize_name_for_lookup(data)
  if key is None:
    return keywords

  # try to use PokeAPI by number or name
  species = get_species(key, cache_dir=cache_dir)
  if species:
    # Legendary/Mythical
    if species.get('is_legendary'):
      keywords.add('Legendary')
    if species.get('is_mythical'):
      keywords.add('Mythical')

    # generation -> region heuristic
    gen = species.get('generation')
    if gen and isinstance(gen, dict):
      gen_name = gen.get('name')  # e.g., generation-i
      if gen_name:
        map_gen_to_region = {
          'generation-i': 'Kanto',
          'generation-ii': 'Johto',
          'generation-iii': 'Hoenn',
          'generation-iv': 'Sinnoh',
          'generation-v': 'Unova',
          'generation-vi': 'Kalos',
          'generation-vii': 'Alola',
          'generation-viii': 'Galar'
        }
        region = map_gen_to_region.get(gen_name)
        if region:
          keywords.add(region)

    # pokedex entries -> possible region tags
    pokedex_numbers = species.get('pokedex_numbers', [])
    for entry in pokedex_numbers:
      pd = entry.get('pokedex', {})
      pd_name = pd.get('name')
      if not pd_name:
        continue
      # common names include 'national' or 'kanto'
      if 'kanto' in pd_name:
        keywords.add('Kanto')
      if 'johto' in pd_name:
        keywords.add('Johto')
      if 'hoenn' in pd_name:
        keywords.add('Hoenn')
      if 'sinnoh' in pd_name:
        keywords.add('Sinnoh')
      if 'unova' in pd_name:
        keywords.add('Unova')
      if 'kalos' in pd_name:
        keywords.add('Kalos')
      if 'alola' in pd_name:
        keywords.add('Alola')
      if 'galar' in pd_name:
        keywords.add('Galar')

  # Starter heuristic: check overrides or capability slugs
  name = (data.get('system', {}) or {}).get('name', '')
  slug = (data.get('system', {}) or {}).get('slug', '')
  lower_name = (name or '').lower()
  lower_slug = (slug or '').lower()
  # override lists
  for region, list_ in (starters_override or {}).items():
    if lower_name in list_ or lower_slug in list_:
      keywords.add('Starter')
  # capability hint
  caps = (data.get('system', {}) or {}).get('capabilities', []) or []
  for c in caps:
    if isinstance(c, dict):
      s = c.get('slug') or c.get('id') or ''
      if 'starter' in str(s).lower():
        keywords.add('Starter')

  # Paradox: overrides or name heuristics
  if (lower_name in paradox_override) or (lower_slug in paradox_override):
    keywords.add('Paradox')
  if 'paradox' in lower_name or 'paradox' in lower_slug:
    keywords.add('Paradox')

  return keywords


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--dry-run', action='store_true', help='Do not write files')
  parser.add_argument('--limit', type=int, default=0, help='Limit number of files processed (0 = all)')
  parser.add_argument('--cache-dir', type=str, default=None, help='PokeAPI cache directory')
  parser.add_argument('--force-refresh', action='store_true', help='Force refresh cache')
  args = parser.parse_args()

  starters_override, paradox_override = load_overrides()
  processed = 0
  for dirpath, dirnames, filenames in os.walk("packs/_source/species"):
    for filename in filenames:
      if args.limit and processed >= args.limit:
        break
      if not filename.endswith('.json'):
        continue
      if filename == "_folder.json":
        continue
      p = os.path.join(dirpath, filename)
      with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)
        system = data.get("system", {})
      if "keywords" not in system or system["keywords"] is None:
        system["keywords"] = []

      calc = calculate_keywords(data, cache_dir=args.cache_dir or None, starters_override=starters_override, paradox_override=paradox_override)
      calculated_keywords = set([*system["keywords"], *calc])

      if calculated_keywords != set(system["keywords"]):
        system["keywords"] = list(calculated_keywords)
        print(f"Updating {p} with keywords: {system['keywords']}")
        if not args.dry_run:
          with open(p, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
      processed += 1



if __name__ == '__main__':
    main()