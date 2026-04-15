#!/usr/bin/env python3
"""
Fix pack slugs in packs/_source JSON files.

Usage:
  python3 scripts/fix_pack_slugs.py [--root PACKS/_SOURCE] [--dry-run] [--verbose]
"""
import argparse
import json
import logging
import re
import os
import unicodedata
from pathlib import Path


def sluggify(text: str) -> str:
    if text is None:
        return ''
    s = str(text)
    s = unicodedata.normalize('NFKD', s)
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')


def process_object(obj: dict, seen: set, file_path: Path) -> bool:
    """Ensure `obj['system']['slug']` exists; return True if modified."""
    if not isinstance(obj, dict):
        return False
    system = obj.get('system')
    slug = None
    if isinstance(system, dict) and 'slug' in system:
        slug = system.get('slug')
        if isinstance(slug, str) and not slug.strip():
            slug = None
    if slug is None:
        name = obj.get('name') or obj.get('label') or obj.get('title')
        if not name:
            logging.warning('%s: missing name; cannot compute slug', file_path)
            return False
        new_slug = sluggify(name)
        if 'system' not in obj or not isinstance(obj['system'], dict):
            obj['system'] = {}
        obj['system']['slug'] = new_slug
        slug = new_slug
        modified = True
    else:
        modified = False
    if slug in seen:
        logging.warning('%s: duplicate slug "%s"', file_path, slug)
    else:
        seen.add(slug)
    return modified


def main():
    parser = argparse.ArgumentParser(description='Fix `system.slug` in packs/_source JSON files.')
    parser.add_argument('--root', default='packs/_source', help='Root folder to scan (default: packs/_source)')
    parser.add_argument('--dry-run', action='store_true', help='Show changes without writing files')
    parser.add_argument('--verbose', action='store_true', help='Show debug output')
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format='%(levelname)s: %(message)s')

    root = Path(args.root)
    if not root.exists():
        logging.error('Root path does not exist: %s', root)
        raise SystemExit(2)

    total_files = 0
    modified_files = 0

    for dirpath, dirnames, filenames in os.walk(root):
        seen = set()
        for filename in filenames:
            if not filename.endswith('.json'):
                continue
            if filename == "_folder.json":
                continue
            total_files += 1
            p = Path(dirpath) / filename
            try:
                text = p.read_text(encoding='utf-8')
                data = json.loads(text)
            except Exception as e:
                logging.error('%s: failed to read/parse JSON: %s', p, e)
                continue

            changed = False
            if isinstance(data, dict):
                if process_object(data, seen, p):
                    changed = True
            elif isinstance(data, list):
                for obj in data:
                    if process_object(obj, seen, p):
                        changed = True
            else:
                logging.warning('%s: unexpected JSON root type: %s', p, type(data))
                continue

            if changed:
                if args.dry_run:
                    logging.info('%s: would update slug(s) (dry-run)', p)
                else:
                    try:
                        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                        modified_files += 1
                        logging.info('%s: updated and saved', p)
                    except Exception as e:
                        logging.error('%s: failed to write file: %s', p , e)

    logging.info('Processed %d files, modified %d files', total_files, modified_files)


if __name__ == '__main__':
    main()
