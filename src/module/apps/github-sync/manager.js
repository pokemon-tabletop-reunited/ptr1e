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

    /**
     * Warnings from the most recent successful commit, shown in the commit
     * manager sheet after staging. Reset on each new commit attempt.
     * @type {string[]}
     */
    static #lastWarnings = [];

    /** @returns {string[]} */
    static get lastWarnings() {
        return GithubSyncManager.#lastWarnings;
    }

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
        const { mergeCleanup } = GithubSyncManager.config;

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
     * Main entry point.
     *
     * Pipeline (validate-all-first, then stage-all):
     *  1. Guard checks (isCommittableItem, pack exists, blockedItems).
     *  2. Collect all transitive referenced documents via getReferencedDocuments.
     *  3. Prepare blobs for the primary item AND every dependency upfront
     *     (merge/diff → transform → validateDocument).
     *  4. Aggregate all errors and warnings across every blob.
     *     Unresolvable/non-compendium UUID references become warnings.
     *  5. If ANY errors exist: show them and abort — nothing is staged.
     *  6. Stage all blobs (primary first, dependencies silently).
     *  7. Open the commit manager UI.
     *
     * @param {Item} document  The live Foundry Item to commit
     */
    static async commitItemToGithub(document) {
        const { blockedItems } = GithubSyncManager.config;

        if (!GithubSyncManager.isCommittableItem(document)) {
            ui.notifications.error(
                `Cannot commit this item to GitHub — it must be imported from or opened directly from a supported compendium pack.`
            );
            return;
        }

        // ── Resolve transitive dependencies ───────────────────────────────────
        const { committable, invalid } = await GithubSyncManager.#collectReferencedItems(
            document,
            new Set([document.uuid])
        );

        // Verify the primary item isn't blocked
        // (We can't check blockedItems for deps without their pack counterpart;
        //  #prepareItemBlob resolves that anyway, so we check the primary here.)
        const primaryPackId = GithubSyncManager.config.documentTypes[document.type];
        const primaryPack = game.packs.get(primaryPackId);
        if (!primaryPack) {
            ui.notifications.error(
                `Compendium pack "${primaryPackId}" not found. Check your documentTypes config.`
            );
            return;
        }
        const primaryExisting = await GithubSyncManager.getExistingItem(document, primaryPack);
        if (primaryExisting && blockedItems(document, primaryExisting)) {
            ui.notifications.error("This item cannot be committed to GitHub.");
            return;
        }

        // ── Prepare all blobs upfront (no staging yet) ────────────────────────
        let primaryBlob;
        try {
            primaryBlob = await GithubSyncManager.#prepareItemBlob(document);
        } catch (error) {
            ui.notifications.error("An unexpected error occurred while preparing the item.");
            console.error("GithubSync |", error);
            return;
        }
        if (!primaryBlob) return; // #prepareItemBlob already notified

        const depBlobs = [];
        for (const dep of committable) {
            let blob;
            try {
                blob = await GithubSyncManager.#prepareItemBlob(dep);
            } catch (error) {
                console.error(`GithubSync | Error preparing dependency "${dep.name}":`, error);
                blob = {
                    data: null, diff: null,
                    valid: false,
                    errors: [`Dependency "${dep.name}": unexpected error during preparation (see console).`],
                    warnings: [],
                };
            }
            if (blob) depBlobs.push({ item: dep, blob });
        }

        // ── Aggregate validation results ──────────────────────────────────────
        const allErrors = [
            ...primaryBlob.errors,
            ...invalid.map((uuid) =>
                `Referenced document could not be resolved to a supported compendium: ${uuid}`
            ),
        ];
        const allWarnings = [...primaryBlob.warnings];

        for (const { item: dep, blob } of depBlobs) {
            allErrors.push(
                ...blob.errors.map((e) => `Dependency "${dep.name}": ${e}`)
            );
            allWarnings.push(
                ...blob.warnings.map((w) => `Dependency "${dep.name}": ${w}`)
            );
        }

        if (allErrors.length) {
            for (const err of allErrors) ui.notifications.error(err);
            return; // abort — nothing staged
        }

        GithubSyncManager.#lastWarnings = allWarnings;

        // ── Stage all blobs ───────────────────────────────────────────────────
        if (primaryBlob.data === null) {
            ui.notifications.info("No changes detected — nothing to commit.");
            return;
        }

        try {
            const primaryResult = await GithubSyncManager.saveBlobToGithub(
                primaryBlob.data,
                primaryBlob.diff
            );
            if (!primaryResult) return;

            const stagedDeps = depBlobs.filter(({ blob }) => blob.data !== null);
            if (stagedDeps.length) {
                // Resolve identity once for all dependency staging calls.
                const identity = await GithubSyncManager.getIdentity();
                if (!identity) {
                    ui.notifications.error("Unable to identify user for GitHub commit.");
                    return;
                }
                for (const { item: dep, blob } of stagedDeps) {
                    const result = await GithubSyncManager.#authenticatedFetch(
                        identity,
                        { data: blob.data, diff: blob.diff, flags: { new: true } }
                    );
                    if (!result?.success) {
                        console.error(`GithubSync | Failed to stage dependency "${dep.name}".`, result);
                    }
                }
            }
        } catch (error) {
            ui.notifications.error("An unexpected error occurred.");
            console.error("GithubSync |", error);
            return;
        }

        GithubSyncManager.#openSheet();
    }

    /**
     * Validate a document (and all its transitive referenced dependencies)
     * against the full commit pipeline — without staging anything.
     *
     * Useful from macros or the console to pre-check an item before committing:
     *   `await game.ptu.github.validateItem(item)`
     *
     * @param {Item} document  The live Foundry Item to validate
     * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
     */
    static async validateItem(document) {
        if (!GithubSyncManager.isCommittableItem(document)) {
            return {
                valid: false,
                errors: ["Item must be opened directly from a supported compendium pack."],
                warnings: [],
            };
        }

        const { committable, invalid } = await GithubSyncManager.#collectReferencedItems(
            document,
            new Set([document.uuid])
        );

        let primaryBlob;
        try {
            primaryBlob = await GithubSyncManager.#prepareItemBlob(document);
        } catch (error) {
            return {
                valid: false,
                errors: ["Unexpected error during preparation (see console)."],
                warnings: [],
            };
        }

        const allErrors = [
            ...(primaryBlob?.errors ?? ["Preparation failed."]),
            ...invalid.map((uuid) =>
                `Referenced document could not be resolved to a supported compendium: ${uuid}`
            ),
        ];
        const allWarnings = [...(primaryBlob?.warnings ?? [])];

        for (const dep of committable) {
            let blob;
            try {
                blob = await GithubSyncManager.#prepareItemBlob(dep);
            } catch {
                allErrors.push(`Dependency "${dep.name}": unexpected error during preparation (see console).`);
                continue;
            }
            if (blob) {
                allErrors.push(...blob.errors.map((e) => `Dependency "${dep.name}": ${e}`));
                allWarnings.push(...blob.warnings.map((w) => `Dependency "${dep.name}": ${w}`));
            }
        }

        return { valid: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
    }

    /**
     * Recursively collect all transitive documents referenced by `document`.
     * Uses `config.getReferencedDocuments` to get UUIDs, resolves each with
     * `fromUuidSync`, and recurses into committable items.
     *
     * @param {Item} document   The item whose references to collect
     * @param {Set<string>} visited  UUID strings already visited (cycle guard)
     * @returns {Promise<{ committable: Item[], invalid: string[] }>}
     *   `committable` — resolved items that can be committed.
     *   `invalid`     — UUIDs that could not be resolved or are not in a known pack.
     */
    static async #collectReferencedItems(document, visited) {
        const { getReferencedDocuments } = GithubSyncManager.config;
        const committable = [];
        const invalid = [];

        const uuids = getReferencedDocuments(document.toObject?.() ?? document);
        for (const uuid of uuids) {
            if (visited.has(uuid)) continue;
            visited.add(uuid);

            const resolved = await fromUuid(uuid);
            if (!resolved || !GithubSyncManager.isCommittableItem(resolved)) {
                invalid.push(uuid);
                continue;
            }

            committable.push(resolved);

            // Recurse into this dependency's own references
            const nested = await GithubSyncManager.#collectReferencedItems(resolved, visited);
            committable.push(...nested.committable);
            invalid.push(...nested.invalid);
        }

        return { committable, invalid };
    }

    /**
     * Prepare a single item blob for staging: resolves the pack counterpart,
     * diffs (or strips metadata for new items), applies `transform`, then runs
     * `validateDocument`. Does NOT stage anything.
     *
     * @param {Item} item
     * @returns {Promise<{ data: object, diff: object, errors: string[], warnings: string[] }|null>}
     *   Returns `null` if a hard infrastructure error (e.g. pack not found)
     *   prevented preparation — in which case a user-facing notification has
     *   already been shown.
     */
    static async #prepareItemBlob(item) {
        const { documentTypes, transform, validateDocument } = GithubSyncManager.config;

        const packId = documentTypes[item.type];
        const pack = game.packs.get(packId);
        if (!pack) {
            ui.notifications.error(
                `Compendium pack "${packId}" not found. Check your documentTypes config.`
            );
            return null;
        }

        const existing = await GithubSyncManager.getExistingItem(item, pack);

        let data, diff;
        if (!existing) {
            // New item — no pack counterpart to diff against
            data = GithubSyncManager.#stripMetadata(item.toObject());
            diff = {};
        } else {
            const isPack = item === existing;
            const itemData = item.toObject();
            const existingData = existing.toObject();

            diff = isPack ? itemData : GithubSyncManager.getDiffableItem(itemData, existingData);

            if (fu.isEmpty(diff)) {
                // No changes — skip this item silently
                return { data: null, diff: null, errors: [], warnings: [] };
            }

            data = GithubSyncManager.prepareUpdateData(diff, existingData);
            if (data === null) {
                return { data: null, diff: null, errors: ["mergeCleanup returned null."], warnings: [] };
            }

            // Track renames so the server can move the file
            if (diff.name) diff.old_name = existingData.name;
        }

        // Apply system-specific transform (e.g. strip Forge/Sqyre image URLs)
        data = transform(data);

        // Validate
        const result = validateDocument(data);
        return {
            data,
            diff: diff ?? {},
            errors: result.errors ?? [],
            warnings: result.warnings ?? [],
        };
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
