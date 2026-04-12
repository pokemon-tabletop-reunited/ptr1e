import fs from "fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import logger from "fancy-log";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ClassicLevel } from "classic-level";


/**
 * Folder where the compiled compendium packs should be located relative to the
 * base 5e system folder.
 * @type {string}
 */
const PACK_DEST = "packs";

/**
 * Folder where source JSON files should be located relative to the 5e system folder.
 * @type {string}
 */
const PACK_SRC = "packs/_source";

/** Maps Foundry document types to their LevelDB collection names. */
const TYPE_TO_COLLECTION = {
  ActiveEffect: "effects", Actor: "actors", Adventure: "adventures",
  Cards: "cards", ChatMessage: "messages", Combat: "combats",
  FogExploration: "fog", Folder: "folders", Item: "items",
  JournalEntry: "journal", Macro: "macros", Playlist: "playlists",
  RollTable: "tables", Scene: "scenes", Setting: "settings", User: "users"
};

/** Maps a collection name to its embedded sub-collection name, if any. */
const COLLECTION_TO_EMBEDDED = {
  actors: "items",
  items: "effects",
  journal: "pages",
  tables: "results",
};


// eslint-disable-next-line
const argv = yargs(hideBin(process.argv))
  .command(packageCommand())
  .help().alias("help", "h")
  .argv;


// eslint-disable-next-line
function packageCommand() {
  return {
    command: "package [action] [pack] [entry]",
    describe: "Manage packages",
    builder: yargs => {
      yargs.positional("action", {
        describe: "The action to perform.",
        type: "string",
        choices: ["unpack", "pack", "clean"]
      });
      yargs.positional("pack", {
        describe: "Name of the pack upon which to work.",
        type: "string"
      });
      yargs.positional("entry", {
        describe: "Name of any entry within a pack upon which to work. Only applicable to extract & clean commands.",
        type: "string"
      });
    },
    handler: async argv => {
      const { action, pack, entry } = argv;
      switch ( action ) {
        case "clean":
          return await cleanPacks(pack, entry);
        case "pack":
          return await compilePacks(pack);
        case "unpack":
          return await extractPacks(pack, entry);
      }
    }
  };
}


/* ----------------------------------------- */
/*  Clean Packs                              */
/* ----------------------------------------- */

/**
 * Removes unwanted flags, permissions, and other data from entries before extracting or compiling.
 * @param {object} data                           Data for a single entry to clean.
 * @param {object} [options={}]
 * @param {boolean} [options.clearSourceId=true]  Should the core sourceId flag be deleted.
 * @param {number} [options.ownership=0]          Value to reset default ownership to.
 */
function cleanPackEntry(data, { clearSourceId=true, ownership=0 }={}) {
  if ( data.ownership ) data.ownership = { default: ownership };
  if ( clearSourceId ) {
    delete data._stats?.compendiumSource;
    delete data.flags?.core?.sourceId;
  }
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if ( data._stats?.lastModifiedBy ) data._stats.lastModifiedBy = "ptubuilder000000";

  // Remove empty entries in flags
  if ( !data.flags ) data.flags = {};
  Object.entries(data.flags).forEach(([key, contents]) => {
    if ( Object.keys(contents).length === 0 ) delete data.flags[key];
  });

  if ( data.system?.activation?.cost === 0 ) data.system.activation.cost = null;
  if ( data.system?.duration?.value === "0" ) data.system.duration.value = "";
  if ( data.system?.target?.value === 0 ) data.system.target.value = null;
  if ( data.system?.target?.width === 0 ) data.system.target.width = null;
  if ( data.system?.range?.value === 0 ) data.system.range.value = null;
  if ( data.system?.range?.long === 0 ) data.system.range.long = null;
  if ( data.system?.uses?.value === 0 ) data.system.uses.value = null;
  if ( data.system?.uses?.max === "0" ) data.system.duration.value = "";
  if ( data.system?.save?.dc === 0 ) data.system.save.dc = null;
  if ( data.system?.capacity?.value === 0 ) data.system.capacity.value = null;
  if ( data.system?.strength === 0 ) data.system.strength = null;

  // Remove mystery-man.svg from Actors
  if ( ["character", "npc"].includes(data.type) && data.img === "icons/svg/mystery-man.svg" ) {
    data.img = "";
    data.prototypeToken.texture.src = "";
  }

  // Deduplicate embedded arrays by _id to fix doubled-entry issues.
  for ( const key of ["effects", "items", "pages", "results"] ) {
    if ( data[key] ) {
      const seen = new Set();
      data[key] = data[key].filter(e => {
        if ( !e._id || !seen.has(e._id) ) { seen.add(e._id); return true; }
        return false;
      });
    }
  }
  if ( data.effects ) data.effects.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
  if ( data.items ) data.items.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
  if ( data.pages ) data.pages.forEach(i => cleanPackEntry(i, { ownership: -1 }));
  if ( data.results ) data.results.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
  if ( data.system?.description?.value ) data.system.description.value = cleanString(data.system.description.value);
  if ( data.label ) data.label = cleanString(data.label);
  if ( data.name ) data.name = cleanString(data.name);
}


/**
 * Removes invisible whitespace characters and normalizes single- and double-quotes.
 * @param {string} str  The string to be cleaned.
 * @returns {string}    The cleaned string.
 */
function cleanString(str) {
  return str.replace(/\u2060/gu, "").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"');
}


/**
 * Walk through directories to find JSON files.
 * @param {string} directoryPath
 * @yields {string}
 */
async function* _walkDir(directoryPath) {
  const directory = await readdir(directoryPath, { withFileTypes: true });
  for ( const entry of directory ) {
    const entryPath = path.join(directoryPath, entry.name);
    if ( entry.isDirectory() ) yield* _walkDir(entryPath);
    else if ( path.extname(entry.name) === ".json" ) yield entryPath;
  }
}

/**
 * Cleans and formats source JSON files, removing unnecessary permissions and flags and adding the proper spacing.
 * @param {string} [packName]   Name of pack to clean. If none provided, all packs will be cleaned.
 * @param {string} [entryName]  Name of a specific entry to clean.
 *
 * - `npm run build:clean` - Clean all source JSON files.
 * - `npm run build:clean -- classes` - Only clean the source files for the specified compendium.
 * - `npm run build:clean -- classes Barbarian` - Only clean a single item from the specified compendium.
 */
async function cleanPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && ( !packName || (packName === file.name) )
  );

  for ( const folder of folders ) {
    logger.info(`Cleaning pack ${folder.name}`);
    for await ( const src of _walkDir(path.join(PACK_SRC, folder.name)) ) {
      const json = JSON.parse(await readFile(src, { encoding: "utf8" }));
      if ( entryName && (entryName !== json.name.toLowerCase()) ) continue;
      if ( !json._id ) {
        console.log(`Failed to clean \x1b[31m${src}\x1b[0m, must have _id.`);
        continue;
      }
      cleanPackEntry(json);
      fs.rmSync(src, { force: true });
      writeFile(src, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o664 });
    }
  }
}


/* ----------------------------------------- */
/*  Compile Packs                            */
/* ----------------------------------------- */

/**
 * Compile the source JSON files into compendium packs.
 * @param {string} [packName]       Name of pack to compile. If none provided, all packs will be packed.
 *
 * - `npm run build:db` - Compile all JSON files into their LevelDB files.
 * - `npm run build:db -- classes` - Only compile the specified pack.
 */
async function compilePacks(packName) {
  const system = JSON.parse(fs.readFileSync("./system.json", { encoding: "utf8" }));
  const sourceFolders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && ( !packName || (packName === file.name) )
  );

  for ( const folder of sourceFolders ) {
    const packInfo = system.packs.find(p => p.name === folder.name);
    const collection = TYPE_TO_COLLECTION[packInfo?.type];
    if ( !collection ) {
      logger.warn(`Unknown pack type for ${folder.name}, skipping.`);
      continue;
    }
    const embeddedKey = COLLECTION_TO_EMBEDDED[collection] ?? null;

    const src = path.join(PACK_SRC, folder.name);
    const dest = path.join(PACK_DEST, folder.name);
    logger.info(`Compiling pack ${folder.name}`);

    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });

    const dbOpts = { keyEncoding: "utf8", valueEncoding: "json" };
    const db = new ClassicLevel(dest, dbOpts);
    const docsDb = db.sublevel(collection, dbOpts);
    const foldersDb = db.sublevel("folders", dbOpts);
    const embeddedDb = embeddedKey ? db.sublevel(`${collection}.${embeddedKey}`, dbOpts) : null;

    const docBatch = docsDb.batch();
    const embeddedBatch = embeddedDb?.batch();
    const folderBatch = foldersDb.batch();

    for await ( const filePath of _walkDir(src) ) {
      const doc = JSON.parse(await readFile(filePath, { encoding: "utf8" }));
      if ( !doc._id ) continue;
      delete doc._key;

      if ( path.basename(filePath) === "_folder.json" ) {
        folderBatch.put(doc._id, doc);
        logger.info(`Compiled folder ${doc.name ?? doc._id}`);
        continue;
      }

      cleanPackEntry(doc);

      if ( embeddedKey && Array.isArray(doc[embeddedKey]) && embeddedBatch ) {
        doc[embeddedKey] = doc[embeddedKey].filter(e => e?._id).map(embed => {
          embeddedBatch.put(`${doc._id}.${embed._id}`, embed);
          return embed._id;
        });
      }

      docBatch.put(doc._id, doc);
      logger.info(`Compiled ${doc._id}${doc.name ? ` (${doc.name})` : ""}`);
    }

    await docBatch.write();
    await embeddedBatch?.write();
    await folderBatch.write();
    await db.close();
  }
}


/* ----------------------------------------- */
/*  Extract Packs                            */
/* ----------------------------------------- */

/**
 * Extract the contents of compendium packs to JSON files.
 * @param {string} [packName]       Name of pack to extract. If none provided, all packs will be unpacked.
 * @param {string} [entryName]      Name of a specific entry to extract.
 *
 * - `npm build:json -- Extract all compendium LevelDB files into JSON files.
 * - `npm build:json -- classes` - Only extract the contents of the specified compendium.
 * - `npm build:json -- classes Barbarian` - Only extract a single item from the specified compendium.
 */
async function extractPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();
  const system = JSON.parse(fs.readFileSync("./system.json", { encoding: "utf8" }));
  const packs = system.packs.filter(p => !packName || p.name === packName);

  for ( const packInfo of packs ) {
    const dest = path.join(PACK_SRC, packInfo.name);
    const packPath = (packInfo.path ?? path.join(PACK_DEST, packInfo.name)).replace(/\.db$/, "");
    const collection = TYPE_TO_COLLECTION[packInfo.type];
    if ( !collection ) {
      logger.warn(`Unknown pack type for ${packInfo.name}, skipping.`);
      continue;
    }
    const embeddedKey = COLLECTION_TO_EMBEDDED[collection] ?? null;
    logger.info(`Extracting pack ${packInfo.name}`);

    const dbOpts = { keyEncoding: "utf8", valueEncoding: "json" };
    const db = new ClassicLevel(packPath, dbOpts);
    const docsDb = db.sublevel(collection, dbOpts);
    const foldersDb = db.sublevel("folders", dbOpts);
    const embeddedDb = embeddedKey ? db.sublevel(`${collection}.${embeddedKey}`, dbOpts) : null;

    // Read all folder documents.
    const folderDocs = {};
    for await ( const [, folder] of foldersDb.iterator() ) folderDocs[folder._id] = folder;

    // Read all pack documents, reassembling embedded arrays from their sublevel.
    const docs = [];
    for await ( const [, doc] of docsDb.iterator() ) {
      if ( embeddedKey && Array.isArray(doc[embeddedKey]) && embeddedDb ) {
        const ids = doc[embeddedKey].filter(e => typeof e === "string");
        if ( ids.length ) {
          const embeds = await embeddedDb.getMany(ids.map(id => `${doc._id}.${id}`));
          doc[embeddedKey] = embeds.filter(Boolean);
        }
      }
      docs.push(doc);
    }
    await db.close();

    // Build folder path map (recursive, handles nesting).
    const folderPaths = {};
    const buildFolderPath = id => {
      if ( folderPaths[id] !== undefined ) return folderPaths[id];
      const f = folderDocs[id];
      if ( !f ) return (folderPaths[id] = "");
      const parent = f.folder ? buildFolderPath(f.folder) : "";
      return (folderPaths[id] = parent ? path.join(parent, slugify(f.name)) : slugify(f.name));
    };
    for ( const id of Object.keys(folderDocs) ) buildFolderPath(id);

    // Build container path map.
    const containers = {};
    for ( const doc of docs ) {
      if ( doc.type === "container" ) {
        containers[doc._id] = { name: slugify(doc.name), container: doc.system?.container, folder: doc.folder };
      }
    }
    for ( const c of Object.values(containers) ) {
      let cur = c;
      c.path = c.name;
      while ( cur.container && containers[cur.container] ) {
        cur = containers[cur.container];
        c.path = path.join(cur.name, c.path);
      }
      const folderPath = cur.folder ? (folderPaths[cur.folder] ?? "") : "";
      if ( folderPath ) c.path = path.join(folderPath, c.path);
    }

    // Clean destination directory.
    if ( fs.existsSync(dest) ) fs.rmSync(dest, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });

    // Write _folder.json files.
    for ( const folder of Object.values(folderDocs) ) {
      const folderPath = folderPaths[folder._id] ?? slugify(folder.name);
      const dir = path.join(dest, folderPath);
      fs.mkdirSync(dir, { recursive: true });
      await writeFile(path.join(dir, "_folder.json"), `${JSON.stringify(folder, null, 2)}\n`, { mode: 0o664 });
    }

    // Write document JSON files.
    for ( const doc of docs ) {
      if ( entryName && doc.name?.toLowerCase() !== entryName ) continue;
      cleanPackEntry(doc);
      const outputName = slugify(doc.name);
      const parent = containers[doc.system?.container] ?? (doc.folder ? { path: folderPaths[doc.folder] ?? "" } : null);
      const filePath = path.join(dest, parent?.path ?? "", `${outputName}.json`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o664 });
      logger.info(`Extracted ${doc._id} (${doc.name})`);
    }
  }
}


/**
 * Standardize name format.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name.toLowerCase().replace("'", "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+|-{2,}/g, "-");
}