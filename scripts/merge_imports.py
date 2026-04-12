#!/usr/bin/env python3
"""
Merge JSON exports from `import/` into `packs/_source/*`.

Behavior:
- Use a sluggified `name` field from incoming JSON to form the filename.
- Use the `type` field to choose the target subfolder under `packs/_source/`.
- If a target file already exists, preserve its `_id` field.
- If the incoming JSON lacks a `folder`, infer the most common `folder` value
  among existing files in the target folder (if any).

Usage:
  python3 scripts/merge_imports.py [--dry-run] [--backup]

Options:
  --import-dir PATH   Directory with exported JSON (default: import)
  --packs-dir PATH    Packs source directory (default: packs/_source)
  --dry-run           Do not write files; only print planned actions
  --backup            Write backups of overwritten files with .bak
"""

from pathlib import Path
import argparse
import json
import re
from collections import Counter
from typing import Optional, Any, Dict


def slugify(s: str) -> str:
    s = s.lower().strip()
    # Replace spaces and slashes with hyphens
    s = re.sub(r"[\s/]+", "-", s)
    # Remove characters that are not alphanumeric, hyphen, or underscore
    s = re.sub(r"[^a-z0-9-_]", "", s)
    # Collapse multiple hyphens
    s = re.sub(r"-+", "-", s)
    return s or "untitled"


def normalize_type(t: str) -> str:
    if not t:
        return "items"
    t = str(t).lower().strip()
    # common irregulars
    map_irregulars = {
        "ability": "abilities",
        "capability": "capabilities",
        "edge": "edges",
        "effect": "effects",
        "move": "moves",
        "feat": "feats",
        "journal": "journals",
        "macro": "macros",
        "item": "items",
        "abilitys": "abilities",
    }
    if t in map_irregulars:
        return map_irregulars[t]
    if t.endswith("s"):
        return t
    if t.endswith("y"):
        return t[:-1] + "ies"
    return t + "s"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any, backup: bool = False) -> None:
    if backup and path.exists():
        bak = path.with_suffix(path.suffix + ".bak")
        bak.write_bytes(path.read_bytes())
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def infer_common_folder(target_dir: Path) -> Optional[Any]:
    folders = []
    if not target_dir.exists():
        return None
    for p in target_dir.glob("*.json"):
        try:
            obj = read_json(p)
        except Exception:
            continue
        v = obj.get("folder")
        if v is not None:
            folders.append(v)
    if not folders:
        return None
    return Counter(folders).most_common(1)[0][0]


def find_existing_by_name(packs_dir: Path, slug: str, name: str) -> Optional[Path]:
    # Search all JSON files under packs_dir for matching filename stem, name field, or slugified name
    for p in packs_dir.rglob("*.json"):
        try:
            if p.stem == slug:
                return p
            obj = read_json(p)
        except Exception:
            continue
        obj_name = obj.get("name")
        if obj_name and obj_name == name:
            return p
        # also compare slugified names
        if obj_name and slugify(obj_name) == slug:
            return p
    return None


def extract_id_from_path(path: Path) -> Optional[str]:
    stem = path.stem
    if not stem:
        return None
    return stem[-16:]


def get_folder_id_for_dir(dir_path: Path) -> Optional[str]:
    folder_file = dir_path / "_folder.json"
    if not folder_file.exists():
        return None
    try:
        data = read_json(folder_file)
        return data.get("_id")
    except Exception:
        return None


def process_item(obj: Dict[str, Any], packs_dir: Path, source_path: Path, dry_run: bool = False, backup: bool = False) -> str:
    name = obj.get("name") or (obj.get("data") or {}).get("name")
    if not name:
        return "skipped-no-name"
    raw_type = obj.get("type") or (obj.get("data") or {}).get("type") or "items"
    type_name = normalize_type(raw_type)
    slug = slugify(name)

    # Prefer existing files anywhere in packs_dir (including nested subfolders)
    existing_path = find_existing_by_name(packs_dir, slug, name)
    if existing_path is not None:
        dest_path = existing_path
        action = "updated"
        try:
            existing = read_json(dest_path)
            existing_id = existing.get("_id")
        except Exception:
            existing_id = None
        if existing_id is not None:
            obj["_id"] = existing_id
        # If folder missing on incoming object, prefer the existing object's folder
        # Prefer the _folder.json id in the existing object's directory
        folder_id = get_folder_id_for_dir(dest_path.parent)
        if folder_id is not None:
            obj["folder"] = folder_id
    else:
        target_dir = packs_dir / type_name
        target_dir.mkdir(parents=True, exist_ok=True)
        dest_path = target_dir / f"{slug}.json"
        action = "created"
        # Infer folder from target directory when creating new file
        # Prefer the _folder.json id in the target directory
        folder_id = get_folder_id_for_dir(target_dir)
        if folder_id is not None:
            obj["folder"] = folder_id
        else:
            if obj.get("folder") is None:
                inferred = infer_common_folder(target_dir)
                if inferred is not None:
                    obj["folder"] = inferred
        # Assign _id from source filename if missing
        if obj.get("_id") is None:
            src_id = extract_id_from_path(source_path)
            if src_id:
                obj["_id"] = src_id

    if dry_run:
        return f"dry-{action} -> {dest_path}"

    write_json(dest_path, obj, backup=backup)
    return f"{action} -> {dest_path}"


def find_json_files(import_dir: Path):
    for p in import_dir.rglob("*.json"):
        yield p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--import-dir", default="import", help="Directory with exported JSON")
    parser.add_argument("--packs-dir", default="packs/_source", help="Packs source directory")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backup", action="store_true", help="Backup overwritten files")
    args = parser.parse_args()

    import_dir = Path(args.import_dir)
    packs_dir = Path(args.packs_dir)

    created = 0
    updated = 0
    skipped = 0
    dry = args.dry_run

    for p in find_json_files(import_dir):
        try:
            data = read_json(p)
        except Exception as e:
            print(f"Failed to read {p}: {e}")
            skipped += 1
            continue

        # Accept either single object or list
        items = data if isinstance(data, list) else [data]
        for item in items:
            res = process_item(item, packs_dir, source_path=p, dry_run=dry, backup=args.backup)
            print(res)
            if res.startswith("created"):
                created += 1
            elif res.startswith("updated"):
                updated += 1
            elif res.startswith("dry-created"):
                created += 1
            elif res.startswith("dry-updated"):
                updated += 1
            else:
                skipped += 1

    print("\nSummary:")
    print(f"  Created: {created}")
    print(f"  Updated: {updated}")
    print(f"  Skipped: {skipped}")


if __name__ == "__main__":
    main()
