#!/usr/bin/env python3
import os
import json
import argparse


def find_json_files(dirpath):
    for root, _, files in os.walk(dirpath):
        for fname in files:
            if fname.endswith('.json') and fname != "_folder.json":
                yield os.path.join(root, fname)


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    p = argparse.ArgumentParser(description='Map feat names and mark Legacy content')
    p.add_argument('--feats-dir', default='packs/_source/feats', help='Path to feats json folder')
    p.add_argument('--out', default='scripts/feats_name_map.json', help='Output mapping file')
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args()

    feats_dir = args.feats_dir
    if not os.path.isdir(feats_dir):
        print(f'Feats directory not found: {feats_dir}')
        return

    name_map = {}
    path_by_name = {}

    for path in find_json_files(feats_dir):
        try:
            data = load_json(path)
        except Exception as e:
            print(f'Failed to load {path}: {e}')
            continue

        name = data.get('name')
        if not name:
            continue

        name_map.setdefault(name, []).append(path)
        path_by_name.setdefault(name, []).append(path)

    # Write the name->filepaths map
    if not args.dry_run:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(name_map, f, ensure_ascii=False, indent=2)
        print(f'Wrote name map to {args.out}')
    else:
        print('Dry run: not writing name map file')

    # For each name that ends with ' [CR]', if base exists, mark base files as Legacy
    suffix = ' [CR]'
    for name in list(name_map.keys()):
        if not name.endswith(suffix):
            continue
        base = name[:-len(suffix)]
        if base not in name_map:
            continue

        # For every file that has the base name, add 'Legacy' into system.keywords
        for target_path in name_map[base]:
            try:
                data = load_json(target_path)
            except Exception as e:
                print(f'Failed to load {target_path}: {e}')
                continue

            system = data.get('system')
            if system is None:
                system = {}
                data['system'] = system

            keywords = system.get('keywords')
            if keywords is None:
                keywords = []
                system['keywords'] = keywords

            if 'Legacy' not in keywords:
                keywords.append('Legacy')
                if args.dry_run:
                    print(f'DRY RUN: would add Legacy to {target_path}')
                else:
                    try:
                        save_json(target_path, data)
                        print(f'Added Legacy to {target_path}')
                    except Exception as e:
                        print(f'Failed to save {target_path}: {e}')

    print('Done')


if __name__ == '__main__':
    main()
