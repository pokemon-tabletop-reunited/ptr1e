
import { MigrationList } from "../migration/index.js";
import { MigrationRunner } from "../migration/runner/index.js"

class MigrationSummary extends Application {
    #isRemigrating = false;

    constructor(options ={}) {
        super(options);

        this.options.troubleshoot ??= false;
        this.options.title = options.troubleshoot
            ? game.i18n.localize("PTU.Migrations.Summary.Troubleshoot.Title")
            : game.i18n.localize("PTU.Migrations.Summary.Title");

        const existing = Object.values(ui.windows).find(
            (app) => app instanceof MigrationSummary
        );
        if (existing) {
            existing.options = foundry.utils.mergeObject(existing.options, options);
            return existing;
        }
    }

    /** @override */
    get template() {
        return "systems/ptu/static/templates/apps/migration-summary.hbs";
    }

    /** @override */
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "migration-summary",
            width: 400,
            height: "auto",
        };
    }

    /** @override */
    async getData() {
        const latestSchemaVersion = MigrationRunner.LATEST_SCHEMA_VERSION;
        const actors = {
            successful: game.actors.filter((actor) => actor.schemaVersion === latestSchemaVersion).length,
            total: game.actors.size,
            failures: game.actors.filter((actor) => actor.schemaVersion !== latestSchemaVersion)
        };
        const items = {
            successful: game.items.filter((item) => item.schemaVersion === latestSchemaVersion || item.type === "dexentry").length,
            total: game.items.size,
            failures: game.items.filter((item) => item.schemaVersion !== latestSchemaVersion && item.type !== "dexentry")
        };
        const canRemigrate =
            this.options.troubleshoot || actors.successful < actors.total || items.successful < items.total;

        const helpResourcesText = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            game.i18n.localize("PTU.Migrations.Summary.HelpResources"),
            { async: true }
        );

        return {
            options: this.options,
            systemVersion: game.system.version,
            latestSchemaVersion,
            actors,
            items,
            canRemigrate,
            helpResources: canRemigrate && !this.isRemigrating,
            helpResourcesText,
        };
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        $html.find("button[data-action=remigrate]").on("click", async (event) => {
            const { LATEST_SCHEMA_VERSION, RECOMMENDED_SAFE_VERSION } = MigrationRunner;
            const lowestVersions = {
                actor:
                    game.actors.size > 0
                        ? Math.min(...game.actors.map((a) => a.schemaVersion ?? 0))
                        : LATEST_SCHEMA_VERSION,
                item:
                    game.items.size > 0
                        ? Math.min(...game.items.map((a) => a.schemaVersion ?? 0))
                        : LATEST_SCHEMA_VERSION,
            };
            const lowestSchemaVersion = Math.max(
                Math.min(lowestVersions.actor, lowestVersions.item),
                RECOMMENDED_SAFE_VERSION
            );

            $html.find(".docs-successful").text("...");

            try {
                this.isRemigrating = true;
                this.options.troubleshoot = false;
                $(event.currentTarget).prop("disabled", true);
                await remigrate({ from: lowestSchemaVersion });
                this.options.troubleshoot = false;
                this.render(false);
            } catch {
                return;
            }
        });

        $html.find("button[data-action=close]").on("click", () => this.close());
    }
}

export { MigrationSummary }

export async function remigrate(versionRange) {
    if (!game.ready) {
        return ui.notifications.warn("PTU.Migrations.WorldNotReady", { localize: true });
    }
    if (game.user.role !== CONST.USER_ROLES.GAMEMASTER) {
        return ui.notifications.error("PTU.Migrations.OnlyGMCanUse", { localize: true });
    }

    const migrations = MigrationList.constructRange(versionRange.from, versionRange.to);
    if (migrations.length === 0 || versionRange.from < MigrationRunner.RECOMMENDED_SAFE_VERSION) {
        return ui.notifications.error(
            game.i18n.format("PTU.Migrations.OutsideSchemaRange", {
                minimum: MigrationRunner.RECOMMENDED_SAFE_VERSION,
                maximum: MigrationRunner.LATEST_SCHEMA_VERSION,
            })
        );
    }
    const runner = new MigrationRunner(migrations);
    await runner.runMigration(true);
}
