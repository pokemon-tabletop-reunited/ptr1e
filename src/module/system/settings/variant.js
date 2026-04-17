import { PTUSettingsMenu } from "./base.js";

const VariantSettingsConfig = {
    "useTutorPoints": {
        name: "PTU.Settings.Variant.UseTutorPoints.Name",
        hint: "PTU.Settings.Variant.UseTutorPoints.Hint",
        type: Boolean,
        default: true
    },
    "useDexExp": {
        name: "PTU.Settings.Variant.UseDexExp.Name",
        hint: "PTU.Settings.Variant.UseDexExp.Hint",
        type: Boolean,
        default: false,
        requiresReload: true
    },
    "spiritPlaytest": {
        name: "PTU.Settings.Variant.SpiritPlaytest.Name",
        hint: "PTU.Settings.Variant.SpiritPlaytest.Hint",
        type: Boolean,
        default: true,
        requiresReload: true
    },
    "improvedStatsRework": {
        name: "PTU.Settings.Variant.ImprovedStatsRework.Name",
        hint: "PTU.Settings.Variant.ImprovedStatsRework.Hint",
        type: Boolean,
        default: true,
        requiresReload: true
    },
    "advancementRework": {
        name: "PTU.Settings.Variant.AdvancementRework.Name",
        hint: "PTU.Settings.Variant.AdvancementRework.Hint",
        type: Boolean,
        default: false,
        requiresReload: true,
        hide: true
    },
    "trainerAdvancement": {
        name: "PTU.Settings.Variant.trainerAdvancement.Name",
        hint: "PTU.Settings.Variant.trainerAdvancement.Hint",
        type: String,
        choices: {
            "original": "PTU.Settings.Variant.trainerAdvancement.Original",
            "data-revamp": "PTU.Settings.Variant.trainerAdvancement.DataRevamp",
            "short-track": "PTU.Settings.Variant.trainerAdvancement.ShortTrack",
            "ptr-update": "PTU.Settings.Variant.trainerAdvancement.PTRUpdate",
            "long-track": "PTU.Settings.Variant.trainerAdvancement.LongTrack",
        },
        default: "original",
        requiresReload: true,
    },
    "useContestRules": {
        name: "PTU.Settings.Variant.UseContestRules.Name",
        hint: "PTU.Settings.Variant.UseContestRules.Hint",
        type: Boolean,
        default: true,
        requiresReload: true
    },
}

export class VariantSettings extends PTUSettingsMenu {
    static namespace = "variant";

    static get settings() {
        return VariantSettingsConfig;
    }

    static get SETTINGS() {
        return Object.keys(VariantSettingsConfig);
    }

    /** @override */
    async _updateObject(event, data) {
        await super._updateObject(event, data);

        if(game.settings.get("ptu", "variant.trainerAdvancement") === "data-revamp" && game.settings.get("ptu", "variant.useDexExp")) {
            return game.settings.set("ptu", "variant.useDexExp", false);
        }
    }
}