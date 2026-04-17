#!/usr/bin/env python3
import os
import json
import time
import urllib.request
import urllib.error

DEFAULT_CACHE_DIR = os.path.join(os.path.dirname(__file__), '.pokeapi_cache')


def _ensure_cache_dir(cache_dir):
    os.makedirs(cache_dir, exist_ok=True)


def _cache_path(cache_dir, identifier):
    safe = str(identifier).replace('/', '_')
    return os.path.join(cache_dir, f"{safe}.json")


def get_species(identifier, cache_dir=None, force_refresh=False, sleep_between_requests=0.5, timeout=10):
    """Fetch `/api/v2/pokemon-species/{identifier}/` from PokeAPI with simple disk caching.

    identifier may be an integer ID or a name/slug string. Returns parsed JSON or None on failure.
    """
    if cache_dir is None:
        cache_dir = DEFAULT_CACHE_DIR
    _ensure_cache_dir(cache_dir)
    cache_file = _cache_path(cache_dir, identifier)
    if os.path.exists(cache_file) and not force_refresh:
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass

    url = f"https://pokeapi.co/api/v2/pokemon-species/{identifier}/"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'fvtt-ptr-keyword-enricher/1.0'
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
        # save cache
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass
        # be polite to the API
        time.sleep(sleep_between_requests)
        return data
    except urllib.error.HTTPError:
        return None
    except urllib.error.URLError:
        return None
    except Exception:
        return None
