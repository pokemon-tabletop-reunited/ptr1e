import { sluggify, findItemInCompendium } from '../../../util/misc.js';
import { PTUItem } from '../index.js';

class PTUSpecies extends PTUItem {
    get slug() {
        return sluggify(this.name);
    }

    getImagePath({ gender = game.i18n.localize("PTU.Male"), shiny = false, extension = game.settings.get("ptu", "generation.defaultImageExtension"), suffix = "" }={}) {
        const path = game.settings.get("ptu", "generation.defaultImageDirectory");
        const useName = game.settings.get("ptu", "generation.defaultPokemonImageNameType");
        const femaleTag = gender.toLowerCase() == "female" ? "f" : "";
        const shinyTag = shiny ? "s" : "";

        return `${path.startsWith('/') ? "" : "/"}${path}${path.endsWith('/') ? "" : "/"}${useName ? this.slug : Handlebars.helpers.lpad(this.system.number, 3, 0)}${femaleTag}${shinyTag}${this.system.form ? ("_" + this.system.form) : ""}${suffix ?? ""}${extension.startsWith('.') ? "" : "."}${extension}`;
    }

    static async convertToPTUSpecies(speciesData, options = {}) {
        const data = { type: "species", system: {}, img: "/systems/ptu/static/css/images/icons/dex_icon.png", folder: "5Jvv9TXViaCrDerw", ...options };

        data.name = Handlebars.helpers.capitalize(speciesData._id);
        data.system.slug = sluggify(data.name);
        data.system.number = Number(speciesData.number);

        if (data.system.slug.includes("alolan")) {
            data.system.form = "alolan";
        }
        if (data.system.slug.includes("galarian")) {
            data.system.form = "galarian";
        }
        if (data.system.slug.includes("Hisuian")) {
            data.system.form = "hisuian";
        }

        data.system.stats = {
            hp: speciesData["Base Stats"]["HP"],
            atk: speciesData["Base Stats"]["Attack"],
            def: speciesData["Base Stats"]["Defense"],
            spatk: speciesData["Base Stats"]["Special Attack"],
            spdef: speciesData["Base Stats"]["Special Defense"],
            spd: speciesData["Base Stats"]["Speed"]
        }
        data.system.types = speciesData.Type;

        data.system.abilities = {};
        for (const [tier, abilities] of Object.entries(speciesData.Abilities)) {
            data.system.abilities[tier.toLowerCase()] = [];
            for (const ability of abilities) {
                data.system.abilities[tier.toLowerCase()].push({
                    slug: sluggify(ability),
                    uuid: (await findItemInCompendium({ type: 'ability', name: ability }))?.uuid
                });
            }
        }

        data.system.evolutions = [];
        for (const evolution of speciesData.Evolution) {
            data.system.evolutions.push({
                uuid: (await findItemInCompendium({ type: 'species', name: evolution[1] }))?.uuid,
                slug: sluggify(evolution[1]),
                level: isNaN(Number(evolution[2])) ? 1 : Number(evolution[2]),
                other: {
                    restrictions: evolution[3] == "Null" ? [] : [evolution[3]],
                    evolutionItem: undefined
                }
            });
        }

        data.system.size = {
            height: Number(speciesData["Height"]),
            weight: Number(speciesData["Weight"]),
            sizeClass: speciesData["Size Class"],
            weightClass: Number(speciesData["Capabilities"]["Weight Class"])
        }

        data.system.breeding = {
            genderRatio: Number(speciesData["Breeding Information"]["Gender Ratio"]),
            eggGroups: speciesData["Breeding Information"]["Egg Group"],
            hatchRate: Number(speciesData["Breeding Information"]["Average Hatch Rate"]),
        }

        data.system.diet = speciesData["Diet"];
        data.system.habitats = speciesData["Habitat"];

        data.system.capabilities = {};
        for (const [key, value] of Object.entries(speciesData["Capabilities"])) {
            if (key == "Weight Class") continue;
            if (key == "Other") {
                data.system.capabilities.other = [];
                for (const capability of value) {
                    data.system.capabilities.other.push({
                        slug: sluggify(capability),
                        uuid: (await findItemInCompendium({ type: 'capability', name: capability }))?.uuid
                    });
                };
                continue;
            }
            data.system.capabilities[sluggify(key, { camel: 'dromedary' })] = value;
        }

        data.system.moves = {
            level: [],
            machine: [],
            egg: [],
            tutor: [],
        }

        for (const move of speciesData["Level Up Move List"]) {
            data.system.moves.level.push({
                uuid: (await findItemInCompendium({ type: 'move', name: move.Move }))?.uuid,
                slug: sluggify(move.Move),
                level: move.Level,
            })
        }
        if (speciesData["TM Move List"]?.length > 0) {
            for (const tmNumber of speciesData["TM Move List"]) {
                if(isNaN(Number(tmNumber))) continue;
                data.system.moves.machine.push({
                    uuid: (await findItemInCompendium({ type: 'move', name: CONFIG.PTU.data.tmData.get(tmNumber + "") }))?.uuid,
                    slug: sluggify(CONFIG.PTU.data.tmData.get(tmNumber + "")),
                });
            };
        }

        if (speciesData["Egg Move List"]?.length > 0) {
            for (const move of speciesData["Egg Move List"]) {
                data.system.moves.egg.push({
                    uuid: (await findItemInCompendium({ type: 'move', name: move }))?.uuid,
                    slug: sluggify(move),
                })
            }
        }

        if (speciesData["Tutor Move List"]?.length > 0) {
            for (const move of speciesData["Tutor Move List"]) {
                data.system.moves.tutor.push({
                    uuid: (await findItemInCompendium({ type: 'move', name: move.replace("(N)", "").trim() }))?.uuid,
                    slug: sluggify(move),
                })
            }
        }

        data.system.skills = {}
        for (const [key, value] of Object.entries(speciesData["Skills"])) {
            data.system.skills[sluggify(key, { camel: 'dromedary' })] = {
                value: value.Dice,
                modifier: value.Mod
            };
        }

        if (options?.prepareOnly) return data;
        return Item.create(data);
    }
}

export { PTUSpecies }