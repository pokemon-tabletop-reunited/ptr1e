import { PokemonGenerator } from "../module/actor/pokemon/generator.js"
import { GithubSyncManager } from "../module/apps/github-sync/manager.js"
import { CompendiumBrowser } from "../module/apps/compendium-browser/index.js"
import { MigrationSummary } from "../module/apps/migration-summary.js"
import { TokenPanel } from "../module/apps/token-panel.js"
import { StatusEffects } from "../module/canvas/status-effect.js"
import { MigrationList } from "../module/migration/index.js"
import { MigrationRunner } from "../module/migration/runner/index.js"
import { EffectTracker } from "../module/system/effect-tracker.js"
import { getSpeciesData } from "../module/system/index.js"
import { findItemInCompendium, querySpeciesCompendium } from "../util/misc.js"
import { resolveInjectedProperties, resolveValue } from "../util/value-resolver.js"
import { dexSync } from "./macros/dex-sync.js"
import { pokedex } from "./macros/pokedex.js"
import { changeRotomForm } from "./macros/rotom-form-change.js"
import { TypeMatrix } from "../module/apps/type-matrix.js";
import { Weather } from "../module/apps/weather.js";
import { PTUPokemonTrainingSheet } from "../module/apps/pokemon-training/index.js";

const GamePTU = {
    onInit() {
        const initData = {
            species: {
                get: getSpeciesData,
                query: querySpeciesCompendium,
                generator: PokemonGenerator
            },
            item: {
                get: (name, type) => findItemInCompendium({ type, name }),
            },
            StatusEffects,
            forms: {
                massGenerator: undefined
            },
            effectTracker: new EffectTracker(),
            resolver: {
                resolveInjectedProperties,
                resolveValue
            },
            migration: {
                MigrationList,
                MigrationRunner,
                MigrationSummary
            },
            weather: Weather,
            pokemonTraining: PTUPokemonTrainingSheet,
            macros: {
                changeRotomForm,
                pokedex,
                dexSync,
                initializeWorldNotes: (async () => {
                    if (game.folders.getName("Actor Notes")) {
                        return game.settings.set("ptu", "worldNotesFolder", game.folders.getName("Actor Notes").id)
                    }
        
                    const folder = await Folder.create({ name: "Actor Notes", type: "JournalEntry" });
                    return game.settings.set("ptu", "worldNotesFolder", folder.id)
                }),
                openPokemonTraining: (actor) => {
                    if (!actor) {
                        if (game.user.character === null) {
                            ui.notifications.error("No Character was set for this user.", { localize: true });
                            return;
                        }
                        actor = game.user.character;
                    }
                    new PTUPokemonTrainingSheet({actor}).render(true);
                }
            },
            tokenPanel: new TokenPanel(),
            github: GithubSyncManager,
        }

        Weather._initializeGlobalEffects();

        game.ptu = foundry.utils.mergeObject(game.ptu ?? {}, initData)

        CONFIG.PTU.data.typeEffectiveness = game.settings.get("ptu", "type.typeEffectiveness") ?? CONFIG.PTU.data.typeEffectiveness;
    },
    onSetup() {},
    onReady() {
        game.ptu.compendiumBrowser = new CompendiumBrowser();
        game.ptu.typeMatrix = new TypeMatrix()

        if (game.user.isGM) {
            if (!game.settings.get("ptu", "worldNotesFolder")) {
                game.ptu.macros.initializeWorldNotes();
            }
            // Else if necessary since initializeWorldNotes is async and we don't want to wait for it
            else if (game.folders.get(game.settings.get("ptu", "worldNotesFolder")) === null) {
                game.ptu.macros.initializeWorldNotes();
            }
        }

        // Reset pokemon that have reloadOnReady marked as true
        // This is due to having a temporary species override
        game.actors.filter(a => a.type === "pokemon" && a.reloadOnReady).forEach(a => a.reset())
    }
}

export { GamePTU }