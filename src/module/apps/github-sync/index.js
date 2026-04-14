/**
 * @file index.js
 * Public entry point for the GithubSync module.
 *
 * ─── Portability ────────────────────────────────────────────────────────────
 * To use this in a different Foundry game system:
 *
 *   1. Copy the entire `github-sync/` folder to your system's source tree.
 *   2. Copy `static/templates/apps/github-sync.hbs` to the same relative path
 *      in your system (or override `templatePath` in the config).
 *   3. Copy the `.github-commit-manager` CSS block to your stylesheet.
 *   4. Call `registerGithubSync({ ... })` during your `init` hook with your
 *      system's specific values (see JSDoc below).
 *   5. Optionally expose `manager` on your game namespace for macro/console use.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * @example
 * // In your init hook:
 * import { registerGithubSync } from "./module/apps/github-sync/index.js";
 *
 * registerGithubSync({
 *   systemId: "ptu",
 *   apiUrl: "https://2e.ptr.wiki/foundry",
 *   documentTypes: {
 *     move:        "ptu.moves",
 *     ability:     "ptu.abilities",
 *     feat:        "ptu.feats",
 *     edge:        "ptu.edges",
 *     effect:      "ptu.effects",
 *     species:     "ptu.species",
 *     item:        "ptu.items",
 *     capability:  "ptu.capabilities",
 *     pokeedge:    "ptu.poke-edges",
 *     reference:   "ptu.references",
 *     spiritaction:"ptu.spirit-actions",
 *   },
 *   // PTU already registers "devMode" — reuse it
 *   devModeSettingKey: "devMode",
 * });
 */

import { createGithubSyncConfig } from "./config.js";
import { GithubSyncManager } from "./manager.js";
import { GithubSyncSheet } from "./sheet.js";
import * as ptr1eGH from "./ptr1e.js";

/**
 * Configure and register the GithubSync module with Foundry.
 *
 * Registers two settings under `config.systemId`:
 *  - `identitySettingKey` (default "github-identity") — client-scoped, hidden
 *  - "github-dev-mode" — world-scoped Boolean, visible in settings UI
 *    (skipped if `devModeSettingKey` points to an existing setting)
 *
 * Registers a `devMode` Handlebars helper that returns the dev-mode setting
 * value (safe to call even if the helper was already registered — it will be
 * overwritten with the same function).
 *
 * @param {import("./config.js").GithubSyncConfig} options
 * @returns {{ manager: typeof GithubSyncManager, sheet: typeof GithubSyncSheet }}
 */
function registerGithubSync(options) {
    const config = createGithubSyncConfig(options);

    // ── Wire circular dependency: manager needs to open the sheet ────────────
    GithubSyncManager.SheetClass = GithubSyncSheet;

    // ── Apply config ─────────────────────────────────────────────────────────
    GithubSyncManager.configure(config);

    // ── Settings ─────────────────────────────────────────────────────────────

    // Cached identity token (client-scoped, never shown in settings UI)
    game.settings.register(config.systemId, config.identitySettingKey, {
        name: config.identitySettingKey,
        scope: "client",
        config: false,
        type: String,
        default: "",
    });

    // Dev-mode toggle — only register if the caller hasn't provided an existing key
    if (!config.devModeSettingKey) {
        game.settings.register(config.systemId, "github-dev-mode", {
            name: "GitHub Sync: Developer Mode",
            hint: "Enables the 'Commit to GitHub' button on item sheets and the GitHub Commit Manager.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            requiresReload: true,
        });
        // Patch config so the manager/sheet can read the correct key
        config.devModeSettingKey = "github-dev-mode";
    }

    // ── Handlebars helper ─────────────────────────────────────────────────────
    // `{{#if (devMode)}}` in templates reads the dev-mode setting.
    // Using the same helper name as PTR2e ("devMode") for template compatibility.
    Handlebars.registerHelper("devMode", () =>
        game.settings.get(config.systemId, config.devModeSettingKey)
    );

    return { manager: GithubSyncManager, sheet: GithubSyncSheet };
}

export { registerGithubSync, GithubSyncManager, GithubSyncSheet, createGithubSyncConfig, ptr1eGH };
