import { PokemonGenerator } from "../../actor/pokemon/generator.js";
import { SpeciesGeneratorData } from "./document.js";

export class PTUSpeciesMassGenerator extends FormApplication {
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ptu", "pokemon", "generator"],
            template: "systems/ptu/static/templates/apps/species-mass-generator-sheet.hbs",
            width: 350,
            height: "auto",
            title: "Species Mass-Generator",
            submitOnChange: true,
            submitOnClose: true,
            closeOnSubmit: false,
            dragDrop: [{ dragSelector: undefined, dropSelector: undefined }]
        });
    }

    constructor(options) {
        super(options);

        this.data = new SpeciesGeneratorData();
    }

    /** @override */
    getData() {
        const data = super.getData();

        return {
            ...data,
            data: this.data,
        }
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        $html.find('.tab-button').on('click', (event) => {
            event.preventDefault();

            this.data.speciesTab = event.currentTarget.dataset.tab;
            this.render(true);
        });

        $html.find("#tableSelect").on("change", (event) => {
            this.data.tableSelect.value = event.currentTarget.value;
            this.data.tableSelect.updated = true;

            this.render(true);
        });

        $html.find("input[type='submit']").on("click", (event) => {
            event.preventDefault();
            this.close({ properClose: true });
        });
    }

    /** @override */
    async _updateObject(event, formData) {
        event.preventDefault();

        if (formData["amount"]) {
            this.data.amount = Number(formData["amount"]);
        }

        if (formData["species"] && formData["species"] != this.data.speciesField.value) {
            this.data.speciesField.value = formData["species"];
            this.data.speciesField.updated = true;
        }

        if (formData["folder"] && formData["folder"] != this.data.folderField.value) {
            this.data.folderField.value = formData["folder"];
            this.data.folderField.updated = true;
        }

        this.data.level.min = formData["level.min"];
        this.data.level.max = formData["level.max"];

        return this.render(true);
    }

    async _onDrop(event) {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));

        if (data.type == "Item") {
            const item = await fromUuid(data.uuid);
            if (item.type != "species") return;

            this.data.speciesField.value = data.uuid;
            this.data.speciesField.updated = true;
        }
        else if (data.type == "RollTable") {
            this.data.tableSelect.value = data.uuid
            this.data.tableSelect.updated = true;
        }
        else if (data.type == "Folder") {
            this.data.folderField.value = data.uuid;
            this.data.folderField.updated = true;
        }

        return this.render(true);
    }

    /** @override */
    render(force = false, options = {}) {
        const localthis = this;
        this.data.refresh().then(() => localthis._render(force, options)).catch(err => {
            this._state = Application.RENDER_STATES.ERROR;
            Hooks.onError("Application#render", err, {
                msg: `An error occurred while rendering ${this.constructor.name} ${this.appId}`,
                log: "error",
                ...options
            });
        });
        return this;
    }

    /** @override */
    async _renderInner(data) {
        const $html = await super._renderInner(data);
        for (const element of $html.find('.linked-item')) {
            await CONFIG.PTU.util.Enricher.enrichContentLinks(element);
        }
        return $html;
    }

    /** @override */
    async close(options) {
        if (options?.properClose) {
            await this.generate(await this.data.finalize());
        }

        return super.close({ ...options, force: true });
    }

    async generate(data) {
        const { species, table, amount, level } = data;
        let folder = data.folder;
        const monsToGenerate = [];

        const shinyChance = game.settings.get("ptu", "generation.defaultDexDragInShinyChance") > 1 ? game.settings.get("ptu", "generation.defaultDexDragInShinyChance") / 100 : game.settings.get("ptu", "generation.defaultDexDragInShinyChance");

        if (species) {
            for (let i = 0; i < amount; i++) {
                const mon = {
                    species: species,
                    level: level.min == level.max ? level.min : Math.floor(Math.random() * (level.max - level.min + 1)) + level.min,
                    shiny: Math.random() < shinyChance,
                    folder
                }
                monsToGenerate.push(mon);
            }
        }
        else if (table) {
            const { results } = await table.drawMany(amount, { displayChat: false });
            for (const result of results) {
                let species = null;
                
                // Handle Foundry VTT v13 table result structure
                if (result.type === "document" || result.type === "compendium") {
                    // Use documentUuid for both document and compendium types in v13
                    if (result.documentUuid) {
                        species = await fromUuid(result.documentUuid);
                    }
                }
                
                // Fallback for older table result structures
                if (!species) {
                    switch (result.type) {
                        case CONST.TABLE_RESULT_TYPES?.DOCUMENT: {
                            species = game.items.get(result.documentId);
                            break;
                        }
                        case CONST.TABLE_RESULT_TYPES?.COMPENDIUM: {
                            species = await game.packs.get(result.documentCollection).getDocument(result.documentId);
                            break;
                        }
                    }
                }
                
                // Check if species was found
                if (!species) {
                    console.error("Species not found for result:", result);
                    continue;
                }
                
                const mon = {
                    species,
                    level: level.min == level.max ? level.min : Math.floor(Math.random() * (level.max - level.min + 1)) + level.min,
                    shiny: Math.random() < shinyChance,
                    folder
                }
                monsToGenerate.push(mon);
            }
        }

        const actorsToGenerate = [];
        for(const mon of monsToGenerate) {
            const generator = new PokemonGenerator(mon.species);
            generator.level = mon.level;
            generator.shiny = mon.shiny;
            await generator.prepare();
            const generatorData = await generator.create({ folder: mon.folder , generate: false});

            const actorData = {
                ...generatorData.actor,
                items: generatorData.items
            }
            actorsToGenerate.push(actorData);
        }

        const createdActors = await CONFIG.PTU.Actor.documentClasses.pokemon.createDocuments(actorsToGenerate);
        console.log(createdActors);
    }
}