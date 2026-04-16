

import json
import os


def main():
  all_ids = set()
  folder_paths = {}
  put_in_folder = {}
  for dirpath, dirnames, filenames in os.walk("packs/_source"):
    folderId = None
    if "_folder.json" in filenames:
      with open(os.path.join(dirpath, "_folder.json"), 'r', encoding='utf-8') as f:
        folder = json.load(f)
        folderId = folder["_id"]
        all_ids.add(folderId)
        folder_paths[folderId] = dirpath
    for filename in filenames:
      if not filename.endswith('.json'):
        continue
      if filename == "_folder.json":
        continue
      p = os.path.join(dirpath, filename)
      with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)
        itemId = data["_id"]
        if itemId in all_ids:
          print(f'{p}: duplicate id {itemId}')
        else:
          all_ids.add(itemId)
        itemFolderId = data.get('folder')
        # if (folderId and folderId != itemFolderId) or (not folderId and itemFolderId):
        #   print(f'{p}: folder mismatch: {itemFolderId} (expected {folderId})')
        if not folderId and itemFolderId:
          put_in_folder[p] = itemFolderId
  
  # move everything into the right folder
  # for itemPath, folderId in put_in_folder.items():
  #   if folderId not in folder_paths:
  #     print(f'{itemPath}: folder {folderId} not found')
  #     continue
  #   p = os.path.join(folder_paths[folderId], os.path.basename(itemPath))
  #   os.remove(p) if os.path.exists(p) else None
  #   os.rename(itemPath, p)
  #   print(f'moved {itemId} to {p}')



if __name__ == '__main__':
    main()