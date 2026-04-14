/**
 * @file config.js
 * Configuration schema for the GithubSync module.
 *
 * Drop-in portability: copy the whole `github-sync/` folder to another system and
 * change only the `createGithubSyncConfig()` call to match that system's IDs.
 */

/**
 * @typedef {Object} GithubSyncConfig
 *
 * REQUIRED
 * @property {string} systemId
 *   Foundry system ID (e.g. "ptu", "ptr2e"). Used as the settings namespace and
 *   to derive the default template path.
 * @property {string} apiUrl
 *   Base URL of the backend server (no trailing slash), e.g.
 *   "https://2e.ptr.wiki/foundry".
 * @property {Record<string, string>} documentTypes
 *   Maps item `type` strings to compendium pack IDs, e.g.
 *   `{ move: "ptu.moves", ability: "ptu.abilities" }`.
 *   Only document types present here can be committed.
 *
 * OPTIONAL — integration hooks
 * @property {string} [identitySettingKey]
 *   Client-scoped setting key used to cache the user's identity token.
 *   Defaults to "github-identity". Registered automatically by
 *   `registerGithubSync()`.
 * @property {string} [devModeSettingKey]
 *   World-scoped setting key for the dev-mode toggle. Pass the name of an
 *   *existing* setting if your system already has one (PTU uses "devMode").
 *   If omitted, `registerGithubSync()` will register "github-dev-mode".
 * @property {string} [templatePath]
 *   Override the path to the Handlebars template. Defaults to
 *   `systems/{systemId}/static/templates/apps/github-sync.hbs`.
 * @property {string} [poweredByHeader]
 *   Value sent as the `X-Powered-By` HTTP header. Defaults to
 *   `"FoundryVTT {systemId}"`.
 *
 * OPTIONAL — system-specific callbacks
 * @property {(item: object, packItem: object) => boolean} [blockedItems]
 *   Return `true` to prevent a specific item from being committed. Use this
 *   for system-specific exclusion rules (e.g. PTR2e's Core Afflictions).
 *   Defaults to `() => false`.
 * @property {(diff: object, packItem: object) => object} [diffCleanup]
 *   Called after universal Foundry noise is removed from the diff. Apply any
 *   system-specific diff cleaning here (e.g. removing action `slot` values).
 *   Must return the (possibly modified) diff object. Defaults to identity.
 * @property {(data: object, diff: object, packItem: object) => object|null} [mergeCleanup]
 *   Called after `fu.mergeObject(packItem, diff)`. Apply any system-specific
 *   post-merge cleanup here (e.g. merging action arrays, stripping `uuid`
 *   fields). Return `null` to abort the commit. Defaults to identity.
 * @property {(data: object) => { valid: boolean, errors: string[], warnings: string[] }} [validateDocument]
 *   Custom document validation before sending to the server. Return
 *   `{ valid: false, errors: [...] }` to abort the commit; include `warnings`
 *   for non-blocking feedback shown in the commit sheet UI.
 *   Defaults to `() => ({ valid: true, errors: [], warnings: [] })`.
 * @property {(data: object) => string[]} [getReferencedDocuments]
 *   Return an array of Foundry UUIDs for every document this item directly
 *   references (e.g. prerequisite abilities, required moves). The commit
 *   pipeline will resolve, validate, and auto-stage all reachable dependencies
 *   in the same commit. Cycles are handled automatically via a visited set.
 *   Defaults to `() => []`.
 * @property {(data: object) => object} [transform]
 *   Applied to the final merged document data just before it is staged,
 *   after `mergeCleanup` and validation. Use this to fix minor data issues
 *   that are not worth a full diff (e.g. stripping ForgeVTT / Sqyre image
 *   URLs, normalising paths). Must return the (possibly modified) data object.
 *   Defaults to identity `(data) => data`.
 * @property {(name: string) => string} [slugify]
 *   Convert an item name to a slug for pack-index fuzzy matching. Defaults to
 *   a simple lowercase-hyphenate implementation; override with your system's
 *   own sluggify utility for best results.
 * @property {(item: object) => string|null} [getItemSlug]
 *   Extract the canonical slug from an item object (raw source or index entry).
 *   Defaults to reading `item.system?.slug`. Items without a slug fall back to
 *   `slugify(item.name)`.
 */

/**
 * Creates a `GithubSyncConfig` object with defaults applied.
 *
 * @param {GithubSyncConfig} options
 * @returns {Required<GithubSyncConfig>}
 */
function createGithubSyncConfig(options) {
    if (!options.systemId) throw new Error("GithubSync: systemId is required");
    if (!options.apiUrl) throw new Error("GithubSync: apiUrl is required");
    if (!options.documentTypes) throw new Error("GithubSync: documentTypes is required");

    return {
        identitySettingKey: "github-identity",
        devModeSettingKey: null, // null = register own "github-dev-mode"
        templatePath: `systems/${options.systemId}/static/templates/apps/github-sync.hbs`,
        poweredByHeader: `FoundryVTT ${options.systemId}`,
        blockedItems: () => false,
        diffCleanup: (diff) => diff,
        mergeCleanup: (data) => data,
        validateDocument: () => ({ valid: true, errors: [], warnings: [] }),
        getReferencedDocuments: () => [],
        transform: (data) => data,
        slugify: (name) =>
            name
                .toLowerCase()
                .replace(/['']/g, "")
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, ""),
        getItemSlug: (item) => item.system?.slug ?? null,
        ...options,
    };
}

export { createGithubSyncConfig };
