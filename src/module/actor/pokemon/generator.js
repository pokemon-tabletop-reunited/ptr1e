import { natureData } from "../../../scripts/config/data/nature.js";
import { levelProgression } from "../../../scripts/config/data/level-progression.js";
import { PTUSpecies } from "../../item/index.js";

export class PokemonGenerator {
    constructor(species, { x, y } = {}) {
        if (!(species instanceof PTUSpecies)) throw new Error("Species must be a valid PTUSPecies instance");
        this.species = species;
        this.x = x;
        this.y = y;
        this.prepared = false;
    }

    async prepare(
        { minLevel, maxLevel, shinyChance, statRandomness, preventEvolution, saveDefault } =
            {
                minLevel: Number(game.settings.get("ptu", "generation.defaultDexDragInLevelMin")),
                maxLevel: Number(game.settings.get("ptu", "generation.defaultDexDragInLevelMax")),
                shinyChance: Number(game.settings.get("ptu", "generation.defaultDexDragInShinyChance")),
                statRandomness: Number(game.settings.get("ptu", "generation.defaultDexDragInStatRandomness")),
                preventEvolution: game.settings.get("ptu", "generation.defaultDexDragInPreventEvolution"),
                saveDefault: false
            }) {
        if (!this.level) {
            this.level = (() => {
                if (minLevel == maxLevel) return minLevel;
                return Math.clamp(0, (Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel), 100);
            })();
        }

        if (!this.gender) this.prepareGender();
        if (!this.evolution) await this.prepareEvolution(preventEvolution);

        // Calc size
        this.size = (() => {
            const size = this.species.system.size.sizeClass;
            switch (size) {
                case "Tiny": return { width: 0.5, height: 0.5 };
                case "Small": return { width: 1, height: 1 };
                case "Medium": return { width: 1, height: 1 };
                case "Large": return { width: 2, height: 2 };
                case "Huge": return { width: 3, height: 3 };
                case "Gigantic": return { width: 4, height: 4 };
                default: return { width: 1, height: 1 };
            }
        })();

        if (!this.nature) this.prepareNature();
        if (!this.stats) this.prepareStats(statRandomness);
        if (!this.moves) this.prepareMoves();
        if (!this.abilities) this.prepareAbilities();
        if (!this.capabilities) this.prepareCapabilities();
        if (!this.shiny) this.prepareShinyness(shinyChance);
        if (!this.form) this.prepareForm();

        this.img = await PokemonGenerator.getImage(this.species, { gender: this.gender, shiny: this.shiny });
        this.tokenImg = (() => {
            if(!this.img) return;
            const tokenImageExtension = game.settings.get("ptu", "generation.defaultTokenImageExtension");
            if(this.img.endsWith(tokenImageExtension)) return this.img;
            const actorImageExtension = game.settings.get("ptu", "generation.defaultImageExtension");
            return this.img.replace(actorImageExtension, tokenImageExtension);
        })();

        if (saveDefault) {
            //TODO: Save Default Settings to system
        }

        this.prepared = true;
        return this;
    }

    async create({ folder, generate = true } = { folder: canvas.scene.name ?? null, generate: true }) {
        if (!this.prepared) await this.prepare();

        if (typeof folder === "string" && folder.length > 0) {
            const exists = game.folders.get(folder) || game.folders.getName(folder);
            if (!exists) {
                ui.notifications.notify(game.i18n.format("PTU.FolderNotFound", { folder }));
                folder = await Folder.create({ name: folder, type: "Actor", parent: null });
            }
            else {
                folder = exists;
            }
        }

        const foundryDefaultSettings = (() => {
            try {
                // Try to get the core default token settings (pre-v13)
                return {...game.settings.get("core", "defaultToken")} ?? {};
            } catch (error) {
                // Fallback for v13+ where this setting may not exist
                return {
                    displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
                    displayName: CONST.TOKEN_DISPLAY_MODES.OWNER,
                    bar1: { attribute: "health" },
                    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
                    alpha: 1,
                    scale: 1,
                    mirrorX: false,
                    mirrorY: false,
                    lockRotation: false,
                    rotation: 0,
                    vision: false,
                    dimSight: 0,
                    brightSight: 0,
                    dimLight: 0,
                    brightLight: 0,
                    lightAnimation: {},
                    lightColor: null,
                    lightAlpha: 0.5,
                    lightAngle: 360,
                    sightAngle: 360
                };
            }
        })();

        const prototypeToken = foundry.utils.mergeObject(foundryDefaultSettings, {
            width: this.size.width,
            height: this.size.height,
            actorLink: true,
            displayBars: foundryDefaultSettings.displayBars ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            displayName: foundryDefaultSettings.displayName ?? CONST.TOKEN_DISPLAY_MODES.OWNER,
            bar1: { attribute: foundryDefaultSettings.bar1?.attribute || "health" },
            img: this.tokenImg,
            "texture.src": this.tokenImg,
        });

        const actorData = {
            name: this.species.name,
            type: "pokemon",
            img: this.img,
            system: {
                stats: this.stats,
                shiny: this.shiny,
                level: {
                    exp: levelProgression[this.level],
                },
                nature: {
                    value: this.nature
                },
                gender: this.gender,
            },
            folder: folder?.id,
            prototypeToken
        }
        if(this.form) actorData.system.form = this.form;

        const species = this.species.toObject();
        species.flags.core = {
            sourceId: this.species.uuid,
        }

        const itemsData = [species];

        for (const speciesMove of this.moves) {
            const move = await fromUuid(speciesMove.uuid);
            if (!move) continue;

            const moveData = move.toObject();
            moveData.flags.core = {
                sourceId: speciesMove.uuid,
            }

            itemsData.push(moveData);
        }

        for (const speciesAbility of this.abilities) {
            const ability = await fromUuid(speciesAbility.data.uuid);
            if (!ability) continue;

            const abilityData = ability.toObject();
            abilityData.flags.core = {
                sourceId: speciesAbility.data.uuid,
            }
            abilityData.flags.ptu = {
                abilityChosen: speciesAbility.tier
            }

            itemsData.push(abilityData);
        }

        for (const speciesCapability of this.capabilities) {
            const capability = await fromUuid(speciesCapability.uuid);
            if (!capability) continue;

            const capabilityData = capability.toObject();
            capabilityData.flags.core = {
                sourceId: speciesCapability.uuid,
            }

            itemsData.push(capabilityData);
        }

        if (!generate) return { actor: actorData, items: itemsData };

        const actor = await Actor.create(actorData);
        await actor.createEmbeddedDocuments("Item", itemsData);

        if (!(this.x && this.y)) return { actor, token: null };

        const x = Math.floor(this.x / canvas.scene.grid.size) * canvas.scene.grid.size
        const y = Math.floor(this.y / canvas.scene.grid.size) * canvas.scene.grid.size

        const tokenData = await actor.getTokenDocument({ x, y });
        const token = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

        return {
            actor,
            token
        }
    }

    prepareGender() {
        const genderRatio = this.species.system.breeding.genderRatio;
        if (genderRatio === -1) return this.gender = game.i18n.localize("PTU.Genderless");

        return this.gender = Math.random() * 100 < genderRatio ? game.i18n.localize("PTU.Male") : game.i18n.localize("PTU.Female");
    }

    async prepareEvolution(preventEvolution) {
        if (preventEvolution) return this.species;

        this.evolution = null;

        const stages = this.species.system.evolutions;
        for (let i = stages.length - 1; i >= 0; i--) {
            if (stages[i].other?.restrictions) {
                if (PokemonGenerator.isEvolutionRestricted(stages[i], { gender: this.gender })) continue;
            }

            if (stages[i].level <= this.level) {
                const sameLevelStages = stages.filter(s => s.level == stages[i].level);
                if (sameLevelStages.length > 1) {
                    const options = [];
                    for (const stage of sameLevelStages) {
                        if (stage.slug === stages[i].slug) {
                            options.push(stage);
                            continue;
                        }
                        if (stage.other?.restrictions) {
                            if (PokemonGenerator.isEvolutionRestricted(stage, { gender: this.gender })) continue;
                        }
                        options.push(stage);
                    }

                    this.evolution = options[Math.floor(Math.random() * options.length)];
                    break;
                }
                this.evolution = stages[i];
                break;
            }
        }

        if (this.evolution) {
            return this.species = await fromUuid(this.evolution.uuid);
        }
    }

    prepareNature() {
        const natures = Object.keys(natureData);
        return this.nature = natures[Math.floor(Math.random() * natures.length)];
    }

    prepareStats(randomness) {
        if (randomness > 1) randomness *= 0.01;

        const levelUpPoints = this.level + 10;
        const randomPoints = Math.ceil(Math.random() * (levelUpPoints * randomness));

        const calculateStats = (points, weighted) => {
            const bag = CreateWeightedBag();
            const result = {};
            for (const [key, value] of Object.entries(this.species.system.stats)) {
                bag.addEntry(key, weighted ? value : 1);
                result[key] = 0;
            }
            for (let i = 0; i < points; i++) {
                const stat = bag.getRandom();
                result[stat]++;
            }
            return result;
        }

        const weightedStats = calculateStats(levelUpPoints - randomPoints, true);
        const randomStats = calculateStats(randomPoints, false);

        this.stats = {};
        for (const [key, value] of Object.entries(this.species.system.stats)) {
            this.stats[key] = {
                base: value,
                levelUp: weightedStats[key] + randomStats[key],
            }
        }
        return this.stats;
    }

    prepareMoves() {
        const levelUpMoves = this.species.system.moves.level.filter(m => m.level <= this.level);
        const evoMoves = this.species.system.moves.level.filter(m => m.level == "Evo");

        const moves = evoMoves ? evoMoves : [];
        for (const move of levelUpMoves.sort((a, b) => b.level - a.level)) {
            if (moves.find(m => m.slug == move.slug)) continue;
            moves.push(move);
            if (moves.length >= 6) break;
        }

        return this.moves = moves.sort((a, b) => a.level === "Evo" ? -1 : b.level === "Evo" ? 1 : a.level - b.level);
    }

    prepareAbilities() {
        this.abilities = [];
        const abilities = this.species.system.abilities;
        if (abilities.basic.length > 1) {
            const basic = abilities.basic[Math.floor(Math.random() * abilities.basic.length)];
            this.abilities.push({ tier: "basic", data: basic });
        }
        else this.abilities.push({ tier: "basic", data: abilities.basic[0] });

        if (this.level >= 20) {
            if (abilities.advanced.length > 1) {
                const advanced = abilities.advanced[Math.floor(Math.random() * abilities.advanced.length)];
                this.abilities.push({ tier: "advanced", data: advanced });
            }
            else this.abilities.push({ tier: "advanced", data: abilities.advanced[0] });

            if (this.level >= 40) {
                if (abilities.high.length > 1) {
                    const high = abilities.high[Math.floor(Math.random() * abilities.high.length)];
                    this.abilities.push({ tier: "high", data: high });
                }
                else this.abilities.push({ tier: "high", data: abilities.high[0] });
            }
        }

        return this.abilities;
    }

    prepareCapabilities() {
        return this.capabilities = this.species.system.capabilities.other || [];
    }

    prepareShinyness(shinyChance) {
        if (shinyChance >= 1) shinyChance *= 0.01;

        if (shinyChance == 0) return this.shiny = false;
        return this.shiny = Math.random() < shinyChance;
    }

    prepareForm() {
        //unown
        const unown_types = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "!", "Qu"];
        if (this.species.system.number === 201) return this.form = this.species.system.form = unown_types[Math.floor(Math.random() * unown_types.length)];

        //toxtricity
        const lowKeyNatures = ["lonely", "bold", "relaxed", "timid", "serious", "modest", "mild", "quiet", "bashful", "calm", "gentle", "careful"]
        if (this.species.system.number === 849 && lowKeyNatures.includes(this.nature.toLowerCase())) return this.form = this.species.system.form = "LowKey";

        return this.form = this.species?.system?.form;
    }

    static isEvolutionRestricted(stage, { gender } = {}) {
        for (const restriction of stage.other.restrictions) {
            if (["male", "female"].includes(restriction.toLowerCase())) {
                if (gender && gender != game.i18n.localize(`PTU.${Handlebars.helpers.capitalizeFirst(restriction)}`)) {
                    return true;
                }
            }
        }
    }

    static async getImage(species, { gender = game.i18n.localize("PTU.Male"), shiny = false, extension = game.settings.get("ptu", "generation.defaultImageExtension"), suffix = "" } = {}) {
        // Check for default
        let path = species.getImagePath({ gender, shiny, extension, suffix });
        let result = await fetch(path)
        if (result.status != 404) return path;

        // Default with webp
        path = species.getImagePath({ gender, shiny, extension: "webp", suffix });
        result = await fetch(path);
        if (result.status != 404) return path;

        // look for male images
        if(gender != game.i18n.localize("PTU.Male")) {
            // Check default with Male
            path = species.getImagePath({ shiny, suffix });
            result = await fetch(path);
            if (result.status != 404) return path;

            // Male with webp
            path = species.getImagePath({ shiny, extension: "webp", suffix });
            result = await fetch(path);
            if (result.status != 404) return path;
        }

        //look for non-shiny images
        if(shiny) {
            path = species.getImagePath({ gender, suffix });
            result = await fetch(path)
            if (result.status != 404) return path;

            path = species.getImagePath({ gender, extension: "webp", suffix });
            result = await fetch(path);
            if (result.status != 404) return path;

            //look for male non-shiny images
            if(gender != game.i18n.localize("PTU.Male")) {
                path = species.getImagePath({ suffix });
                result = await fetch(path);
                if (result.status != 404) return path;
        
                path = species.getImagePath({ extension: "webp", suffix });
                result = await fetch(path);
                if (result.status != 404) return path;
            }
        }

        //all again but ignoring the custom suffix
        if(suffix) return await this.getImage(species, {gender, shiny, extension});

        return undefined;
    }
}

function CreateWeightedBag() {
    const bag = {
        entries: [],
        accumulatedWeight: 0.0,
    };

    bag.addEntry = function (object, weight) {
        bag.accumulatedWeight += weight;
        bag.entries.push({ object: object, accumulatedWeight: bag.accumulatedWeight });
        return bag;
    }

    bag.getRandom = function () {
        var r = Math.random() * bag.accumulatedWeight;
        return bag.entries.find(function (entry) {
            return entry.accumulatedWeight >= r;
        }).object;
    }
    return bag;
}