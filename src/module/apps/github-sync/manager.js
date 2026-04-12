/**
 * @file manager.js
 * GithubSyncManager — static utility class containing all business logic for
 * the in-Foundry GitHub commit/PR workflow.
 *
 * Ported from PTR2e's GithubManager (src/module/apps/github.ts) and made
 * fully generic via a GithubSyncConfig object. No system-specific code lives here.
 *
 * Authentication / API protocol:
 *  - Backend endpoint: `{config.apiUrl}/commit`  (POST)
 *  - Identity endpoint: `{config.apiUrl}/identify` (POST)
 *  - If the server returns `{ auth_url }`, a GitHub OAuth popup is opened and
 *    the request is retried once after the popup closes.
 */

const fu = foundry.utils;

class GithubSyncManager {
    /** @type {import("./config.js").GithubSyncConfig|null} */
    static #config = null;

    /**
     * The GithubSyncSheet class, set by index.js after both modules are loaded
     * to avoid a circular import dependency.
     * @type {typeof import("./sheet.js").GithubSyncSheet|null}
     */
    static SheetClass = null;

    // ─────────────────────────────────────────────────────────────────────────
    //  Setup
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Store a resolved config object. Called once during system init.
     * @param {import("./config.js").GithubSyncConfig} config
     */
    static configure(config) {
        GithubSyncManager.#config = config;
    }

    /** @returns {import("./config.js").GithubSyncConfig} */
    static get config() {
        if (!GithubSyncManager.#config) {
            throw new Error("GithubSyncManager: not configured. Call configure() first.");
        }
        return GithubSyncManager.#config;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Document resolution

    /**
     * Returns true if this item is eligible to be committed:
     *  - Its type is in `documentTypes`, AND
     *  - It either lives inside one of the configured packs, or was imported
     *    from one of them (has a matching compendium source UUID).
     *
     * @param {Item} item
     * @returns {boolean}
     */
    static isCommittableItem(item) {
        const { documentTypes } = GithubSyncManager.config;
        const validPacks = new Set(Object.values(documentTypes));

        // Type must be supported
        if (!documentTypes[item.type]) return false;

        // Item is open directly from a compendium
        if (!item.pack) return false;
        
        return validPacks.has(item.pack);

        // World item — check if it was imported from one of the valid packs.
        // Source UUID format: "Compendium.<systemId>.<packName>.Item.<id>"
        // const sourceId =
        //     item.flags?.core?.sourceId ?? item._stats?.compendiumSource;
        // if (sourceId) {
        //     const parts = sourceId.split(".");
        //     if (parts[0] === "Compendium" && parts.length >= 3) {
        //         return validPacks.has(`${parts[1]}.${parts[2]}`);
        //     }
        // }

        // return false;
    }
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Find the compendium item that corresponds to a live world item.
     * Tries compendiumSource flags first, then falls back to slug-based matching.
     *
     * @param {Item} item        Live world item
     * @param {CompendiumCollection} pack  The target compendium
     * @returns {Promise<Item|null>}
     */
    static async getExistingItem(item, pack) {
        const { getItemSlug, slugify } = GithubSyncManager.config;

        const sourceId =
            item.flags?.core?.sourceId ?? item._stats?.compendiumSource;
        if (sourceId) {
            const id = sourceId.split(".").at(-1);
            const found = await pack.getDocument(id);
            if (found) return found;
        }

        const index = await pack.getIndex({ fields: ["system.slug"] });
        const itemSlug = getItemSlug(item.toObject?.() ?? item) ?? slugify(item.name);
        const match = index.find(
            (i) => itemSlug === (getItemSlug(i) ?? slugify(i.name))
        );
        if (match) return pack.getDocument(match._id);

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Diffing & merging
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Compute a clean diff between a live item and its compendium source.
     * Strips universal Foundry metadata noise, then calls `config.diffCleanup`
     * for any system-specific cleanup.
     *
     * @param {object} item      Raw item source (.toObject())
     * @param {object} packItem  Raw pack source
     * @returns {object} Cleaned diff
     */
    static getDiffableItem(item, packItem) {
        const diff = fu.diffObject(packItem, item);

        // Strip universal Foundry metadata noise
        if (diff.flags?.core) {
            delete diff.flags.core;
            if (fu.isEmpty(diff.flags)) delete diff.flags;
        }
        delete diff.sort;
        delete diff._id;
        delete diff._key;
        delete diff._stats;
        delete diff.folder;
        delete diff.ownership;

        if (fu.isEmpty(diff.system)) delete diff.system;

        return GithubSyncManager.config.diffCleanup(diff, packItem);
    }

    /**
     * Merge a diff back onto the pack item to produce the final document state,
     * strip remaining Foundry noise, call `config.mergeCleanup`, then validate.
     *
     * @param {object} diff      Output of getDiffableItem()
     * @param {object} packItem  Raw pack source
     * @returns {object|null}    Merged data, or null if validation fails
     */
    static prepareUpdateData(diff, packItem) {
        const { mergeCleanup, validateDocument } = GithubSyncManager.config;

        let data = fu.mergeObject(packItem, diff, { inplace: false });

        // Explicitly restore every top-level field that must keep its pack/GitHub
        // value and must never be derived from or overwritten by the live world item.
        // We do this explicitly rather than relying on mergeObject carrying them
        // through, because `pack.getDocument().toObject()` may not expose all source
        // fields depending on the Foundry version.
        for (const field of ["_id", "_key", "_stats", "ownership", "folder", "sort"]) {
            if (Object.hasOwn(packItem, field)) data[field] = packItem[field];
            else delete data[field];
        }

        // flags.core.sourceId is a Foundry compendium pointer — not present in
        // GitHub source files and meaningless outside Foundry.
        if (data.flags?.core?.sourceId) delete data.flags.core.sourceId;
        if (fu.isEmpty(data.flags?.core)) delete data.flags?.core;
        if (fu.isEmpty(data.flags)) delete data.flags;

        // System-specific post-merge cleanup (array merging, uuid stripping, etc.)
        data = mergeCleanup(data, diff, packItem);
        if (data === null) return null;

        // Validation (no-op by default; systems override via config)
        const valid = validateDocument(data);
        if (!valid) return null;

        return data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Commit flow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Thin wrapper so this method can be used as an AppV2 sheet action where
     * `this` is the sheet instance and `this.document` is the item.
     * In AppV1 sheets, call `GithubSyncManager.commitItemToGithub(this.object)` instead.
     */
    static async commitItemToGithubSheet() {
        return GithubSyncManager.commitItemToGithub(this.document);
    }

    /**
     * Main entry point: validate → resolve pack item → diff → send blob → open UI.
     * @param {Item} document  The live Foundry Item to commit
     */
    static async commitItemToGithub(document) {
        const { documentTypes, blockedItems } = GithubSyncManager.config;

        if (!GithubSyncManager.isCommittableItem(document)) {
            ui.notifications.error(
                `Cannot commit this item to GitHub — it must be imported from or opened directly from a supported compendium pack.`
            );
            return;
        }

        const packId = documentTypes[document.type];

        const pack = game.packs.get(packId);
        if (!pack) {
            ui.notifications.error(
                `Compendium pack "${packId}" not found. Check your documentTypes config.`
            );
            return;
        }

        const existing = await GithubSyncManager.getExistingItem(document, pack);

        // New item — send raw data without diffing
        if (!existing) {
            try {
                const newData = GithubSyncManager.#stripMetadata(document.toObject());
                const result = await GithubSyncManager.saveBlobToGithub(newData);
                if (result) GithubSyncManager.#openSheet();
            } catch (error) {
                ui.notifications.error("An unexpected error occurred.");
                console.error("GithubSync |", error);
            }
            return;
        }

        if (blockedItems(document, existing)) {
            ui.notifications.error("This item cannot be committed to GitHub.");
            return;
        }

        const isPack = document === existing;
        const itemData = document.toObject();
        const existingData = existing.toObject();

        const diff = isPack
            ? itemData
            : GithubSyncManager.getDiffableItem(itemData, existingData);

        if (fu.isEmpty(diff)) {
            ui.notifications.info("No changes detected — nothing to commit.");
            return;
        }

        const realDiff = GithubSyncManager.prepareUpdateData(diff, existingData);
        if (!realDiff) return;

        // Track renames so the server can move the file
        if (diff.name) diff.old_name = existingData.name;

        try {
            const result = await GithubSyncManager.saveBlobToGithub(realDiff, diff);
            if (result) GithubSyncManager.#openSheet();
        } catch (error) {
            ui.notifications.error("An unexpected error occurred.");
            console.error("GithubSync |", error);
        }
    }

    /**
     * Strip all Foundry/LevelDB metadata from a raw item object in place.
     * Used for new items that have no pack counterpart to diff against.
     * @param {object} data  Result of item.toObject()
     * @returns {object}
     */
    static #stripMetadata(data) {
        delete data._id;
        delete data._key;
        delete data._stats;
        delete data.sort;
        delete data.folder;
        delete data.ownership;
        if (data.flags?.core?.sourceId) delete data.flags.core.sourceId;
        if (fu.isEmpty(data.flags?.core)) delete data.flags?.core;
        if (fu.isEmpty(data.flags)) delete data.flags;
        return data;
    }

    /** Open the commit manager UI (lazily, to avoid circular imports). */
    static #openSheet() {
        if (!GithubSyncManager.SheetClass) {
            console.warn("GithubSync | SheetClass not set — cannot open commit manager UI.");
            return;
        }
        new GithubSyncManager.SheetClass().render(true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Identity / authentication
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolve (or generate) the user's identity token.
     *
     * Flow:
     *  1. If a stored token exists, POST /identify with it.
     *     - 202 → still valid, return it.
     *     - 200 → expired, clear it and fall through.
     *  2. Generate a fresh random ID, POST /identify.
     *     - 200 → server returns a base64-encoded token; decode, save, return.
     *
     * @returns {Promise<string|null>}
     */
    static async getIdentity() {
        const { systemId, apiUrl, poweredByHeader, identitySettingKey } =
            GithubSyncManager.config;

        const stored = game.settings.get(systemId, identitySettingKey);
        if (stored) {
            let resp;
            try {
                resp = await fetch(`${apiUrl}/identify`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Powered-By": poweredByHeader,
                    },
                    body: JSON.stringify({ id: stored }),
                });
            } catch (err) {
                console.error("GithubSync | /identify request failed (stored token):", err);
                return null;
            }

            console.debug(`GithubSync | /identify (stored) → HTTP ${resp.status}`);

            if (resp.status === 202) return stored;
            if (resp.status === 200) {
                // Token is stale — clear and fall through to re-identify
                await game.settings.set(systemId, identitySettingKey, "");
            } else {
                const body = await resp.text().catch(() => "(unreadable)");
                console.error(
                    `GithubSync | /identify returned unexpected status ${resp.status}. Body:`,
                    body
                );
                return null;
            }
        }

        // Generate fresh identity
        const freshId = fu.randomID() + game.user.name + game.user.id;
        let resp;
        try {
            resp = await fetch(`${apiUrl}/identify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Powered-By": poweredByHeader,
                },
                body: JSON.stringify({ id: freshId }),
            });
        } catch (err) {
            console.error("GithubSync | /identify request failed (fresh token):", err);
            return null;
        }

        console.debug(`GithubSync | /identify (fresh) → HTTP ${resp.status}`);

        if (resp.status === 200) {
            const json = await resp.json();
            console.debug("GithubSync | /identify response body:", json);
            const encoded = json.identity;
            if (!encoded) {
                console.error(
                    'GithubSync | /identify returned HTTP 200 but response has no "identity" field.',
                    json
                );
                return null;
            }
            const identity = atob(encoded);
            await game.settings.set(systemId, identitySettingKey, identity);
            return identity;
        }

        const body = await resp.text().catch(() => "(unreadable)");
        console.error(
            `GithubSync | /identify returned unexpected status ${resp.status}. Body:`,
            body
        );
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  API calls
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Stage a single document blob on the backend server.
     *
     * @param {object} data  Fully resolved document (output of prepareUpdateData)
     * @param {object} [diff] Slim diff (with optional old_name for renames)
     * @returns {Promise<object|null>}
     */
    static async saveBlobToGithub(data, diff = {}) {
        const identity = await GithubSyncManager.getIdentity();
        if (!identity) {
            ui.notifications.error("Unable to identify user for GitHub commit.");
            return null;
        }

        const result = await GithubSyncManager.#authenticatedFetch(
            identity,
            { data, diff, flags: { new: true } }
        );

        if (result?.success) {
            ui.notifications.info("Successfully added file to next commit.");
        } else if (result?.error) {
            ui.notifications.error(`GitHub sync error: ${result.error}`);
        } else if (!result) {
            ui.notifications.error("An unexpected error occurred.");
        }

        return result;
    }

    /**
     * Finalize or cancel the pending commit.
     *
     * @param {object} [options]
     * @param {boolean|string} [options.deletePR=false]
     *   `true` → delete all staged blobs.
     *   `"path/to/file.json"` → delete one specific blob.
     * @param {string} [options.message]  Commit message
     * @param {string} [options.title]    Pull Request title
     * @returns {Promise<object|null>}
     */
    static async finalizeCommitToGithub({
        deletePR = false,
        message,
        title,
    } = {}) {
        const identity = await GithubSyncManager.getIdentity();
        if (!identity) {
            ui.notifications.error("Unable to identify user for GitHub commit.");
            return null;
        }

        const flags = {
            new: true,
            ...(deletePR ? { delete: deletePR } : { commit: true }),
            message: message ?? "Auto-generated commit from Foundry VTT.",
            ...(title ? { title } : {}),
        };

        const result = await GithubSyncManager.#authenticatedFetch(identity, { flags });

        if (result && !result.success) {
            if (result.error) ui.notifications.error(`GitHub sync error: ${result.error}`);
            else ui.notifications.error("An unexpected error occurred.");
        }

        return result;
    }

    /**
     * Fetch the list of currently staged blobs.
     * @returns {Promise<{success: boolean, blobs: {name: string, path: string, message: string}[]}|null>}
     */
    static async getCommitStatus() {
        const identity = await GithubSyncManager.getIdentity();
        if (!identity) {
            ui.notifications.error("Unable to identify user for GitHub commit.");
            return null;
        }

        const result = await GithubSyncManager.#authenticatedFetch(
            identity,
            { flags: { new: true, status: true } }
        );

        if (!result) {
            ui.notifications.error("An unexpected error occurred.");
            return { success: true, blobs: [] };
        }
        if (!result.success) {
            // 404 means no pending commit — treat as empty, not an error
            if (result.status === 404) return { success: true, blobs: [] };
            if (result.error) ui.notifications.error(`GitHub sync error: ${result.error}`);
            else ui.notifications.error("An unexpected error occurred.");
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST to `{apiUrl}/commit` with identity header. If the server responds
     * with `{ auth_url }`, open a GitHub OAuth popup and retry once.
     *
     * @param {string} identity   Decoded identity token
     * @param {object} body       JSON-serialisable request body
     * @param {boolean} [retry]   Internal — true on the second attempt
     * @returns {Promise<object|null>}
     */
    static async #authenticatedFetch(identity, body, retry = false) {
        const { apiUrl, poweredByHeader } = GithubSyncManager.config;

        const response = await fetch(`${apiUrl}/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Powered-By": poweredByHeader,
                identity: btoa(identity),
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            try {
                const json = await response.json();
                return { success: false, status: response.status, error: json.error };
            } catch {
                return { success: false, status: response.status };
            }
        }

        const json = await response.json();

        // Server requests GitHub OAuth before it can proceed
        if (json.auth_url) {
            if (retry) {
                ui.notifications.error("GitHub authentication failed — please try again.");
                return null;
            }
            const popup = window.open(json.auth_url, identity, "popup=true");
            await GithubSyncManager.#waitForPopup(popup);
            return GithubSyncManager.#authenticatedFetch(identity, body, true);
        }

        return json;
    }

    /**
     * Wait for a popup window to close (polling every 2.5 s, up to 250 s).
     * @param {Window|null} popup
     */
    static #waitForPopup(popup) {
        return new Promise((resolve, reject) => {
            function poll(depth = 0) {
                if (popup?.closed) return resolve(true);
                if (depth > 100) return reject(new Error("OAuth popup timed out"));
                setTimeout(() => poll(depth + 1), 2500);
            }
            poll();
        });
    }
}

export { GithubSyncManager };
