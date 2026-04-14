/**
 * @file sheet.js
 * GithubSyncSheet — ApplicationV2 window for the "GitHub Commit Manager" UI.
 *
 * Ported from PTR2e's GithubSheet and made generic. The template path is
 * derived from the GithubSyncManager config so it works in any system.
 *
 * This is a standalone dialog window and does NOT extend any item sheet — it
 * is safe to use with systems that still use AppV1 item sheets (Foundry v13
 * supports both APIs simultaneously).
 */

import { GithubSyncManager } from "./manager.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

class GithubSyncSheet extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "github-commit-manager",
        tag: "form",
        classes: ["sheet", "github-commit-manager", "standard-form"],
        position: {
            width: 565,
        },
        window: {
            title: "GitHub Commit Manager",
            minimizable: true,
            resizable: true,
        },
        actions: {
            /** Finalize the staged blobs into a PR. */
            finalize: async function () {
                ui.notifications.info("Finalizing commit to GitHub…");

                const message = this.element
                    .querySelector("[name='commit-message']")
                    ?.value;
                const title = this.element
                    .querySelector("[name='pr-title']")
                    ?.value;

                const result = await GithubSyncManager.finalizeCommitToGithub({
                    message,
                    title,
                });
                if (result?.success) {
                    ui.notifications.info("Successfully created Pull Request on GitHub.");
                }
                this.close();
            },

            /** Delete all staged blobs (if any), then close. */
            cancel: async function () {
                if (this.ongoing) {
                    ui.notifications.info("Discarding pending commit…");
                    await GithubSyncManager.finalizeCommitToGithub({ deletePR: true });
                }
                this.close();
            },

            /** Remove a single staged blob by path. */
            delete: async function (event) {
                if (!this.ongoing) return;

                const button = /** @type {HTMLButtonElement} */ (event.target);
                const path = button.dataset.path;
                if (!path) return;
                button.disabled = true;

                const result = await GithubSyncManager.finalizeCommitToGithub({
                    deletePR: path,
                });
                if (result?.success) {
                    ui.notifications.info("Entry removed from commit.");
                }
                return this.render(true);
            },
        },
    };

    static get PARTS() {
        return {
            main: {
                id: "main",
                template: GithubSyncManager.config.templatePath,
                scrollable: [".scroll"],
            },
        };
    }

    /** True when there is at least one staged blob in the current session. */
    ongoing = false;

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const status = await GithubSyncManager.getCommitStatus();

        this.ongoing = !!(status?.success && status.blobs?.length > 0);

        return {
            ...context,
            status,
            ongoing: this.ongoing,
            warnings: GithubSyncManager.lastWarnings,
        };
    }
}

export { GithubSyncSheet };
