import { Progress } from "../../../util/progress.js";
import { PokemonGenerator } from "../../actor/pokemon/generator.js";

class PTUDexSheet extends FormApplication {
    static speciesArtCache = new Map();
    static speciesMap = new Map();

    constructor(actor, ballStyle, options = {}) {
        super(actor, options);
        this.ballStyle = ballStyle;

        /** @type {PTUActor} */
        this.actor = this.object;
        if (!this.allowedTypes.includes(this.actor.type)) throw Error(`Actor type ${this.actor.type} is not allowed for this sheet.`);

        this.hideSeen = false;
        this.hideOwned = false;
        this.hideUnknown = false;
        this.filter = "";

        if (PTUDexSheet.speciesArtCache.size === 0) PTUDexSheet.speciesArtCache = new Map();
        if (PTUDexSheet.speciesMap.size === 0) {
            new Promise(
                async (resolve, reject) => {
                    const packs = Object.entries(game.settings.get("ptu", "compendiumBrowserPacks")["species"]).reduce((acc, [id, value]) => {
                        if(id === "ptu.species") {
                            if(value.load === false) acc = acc.filter(id => id !== "ptu.species")
                            return acc;
                        }
                        if(value?.load) acc.push(id);
                        return acc;
                    }, ["ptu.species"]) 
                    if (packs.length === 0) return ui.notifications.error("Please enable at least one species compendium from the Compendium Browser settings.");
                    const docs = [];
                    for(const packId of packs) {
                        const pack = game.packs.get(packId);
                        if(!pack) continue;
                        docs.push(...(await pack.getDocuments()));
                    };
                    resolve(docs);
                }
            ).then(docs => this.speciesDocs = docs)
                .then(docs => docs.reduce((map, s) => {
                    map.set(s.slug, s);
                    return map;
                }, new Map()))
                .then(map => PTUDexSheet.speciesMap = map)
                .then(() => this.render(true));
        } else {
            this.speciesDocs = Array.from(PTUDexSheet.speciesMap.values());
        }
    }

    get allowedTypes() {
        return ["character"]
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "PTU.DexSheet.Title",
            classes: ["ptu", "sheet", "gen8", "dex"],
            width: 625,
            height: 775,
            template: 'systems/ptu/static/templates/apps/dex-sheet.hbs',
            resizable: false,
            submitOnChange: true,
            submitOnClose: true,
            closeOnSubmit: false,
            //tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "description" }]
        });
    };

    /** @override */
    _canDragStart(selector) {
        return this.isEditable;
    }
    /** @override */
    _canDragDrop(selector) {
        return this.isEditable;
    }

    async getData() {
        const data = super.getData();

        data.ballStyle = this.ballStyle;

        const dex = foundry.utils.duplicate(this.object.system.dex);
        const seen = new Set(dex.seen);
        const owned = new Set(dex.owned);

        data.dex = {
            seen: [],
            owned: [],
            total: []
        }

        data.dex.total = (this.speciesDocs ?? [])
            .map((species) => ({
                img: PTUDexSheet.speciesArtCache.get(species.slug) ?? "/systems/ptu/static/css/images/icons/dex_icon.png",
                id: species.slug,
                name: Handlebars.helpers.formatSlug(species.slug),
                number: species.system.number,
                seen: seen.has(species.slug),
                owned: owned.has(species.slug)
            }))
            .sort((a, b) => a.number - b.number);

        data.dex.selected = data.dex.total;
        if (this.hideSeen) data.dex.selected = data.dex.selected.filter(s => !s.seen);
        if (this.hideOwned) data.dex.selected = data.dex.selected.filter(s => !s.owned);
        if (this.hideUnknown) data.dex.selected = data.dex.selected.filter(s => s.seen || s.owned);
        if (this.filter) data.dex.selected = data.dex.selected.filter(s => s.name.toLowerCase().includes(this.filter.toLowerCase()));

        return {
            ...data,
            hideSeen: this.hideSeen,
            hideOwned: this.hideOwned,
            hideUnknown: this.hideUnknown,
            search: this.filter
        };
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        $html.find(".dex-item").on("click contextmenu", this._onClickDexItem.bind(this));

        let timeoutId;
        $html.find("input[name='search']").on("keyup", () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(this.submit.bind(this), 300);
        });

        const search = $html.find("input[name='search']")[0];
        search.focus(); search.value = ""; search.value = this.filter;

        if (PTUDexSheet.speciesMap?.size > 0 && PTUDexSheet.speciesArtCache.size == 0) this._lazyLoadImages();
    }

    _onClickDexItem(event) {
        const target = event.currentTarget;
        const id = target.dataset.id;
        if (!id) return;

        const isSeen = target.classList.contains("seen");
        const isOwned = target.classList.contains("owned");

        const positive = event.which === 1;
        if (isOwned && positive) return;
        if (isOwned && !positive) {
            this.actor.update({
                [`system.dex.owned`]: this.actor.system.dex.owned.filter(s => s !== id),
                [`system.dex.seen`]: this.actor.system.dex.seen.concat(id)
            });
            target.classList.remove("owned");
            target.classList.add("seen");
            return //ui.notifications.info(game.i18n.format("PTU.DexSheet.Notifications.Unowned", { name: Handlebars.helpers.formatSlug(id) }))
        }
        if (isSeen && positive) {
            this.actor.update({
                [`system.dex.seen`]: this.actor.system.dex.seen.filter(s => s !== id),
                [`system.dex.owned`]: this.actor.system.dex.owned.concat(id)
            });
            target.classList.remove("seen");
            target.classList.add("owned");
            return //ui.notifications.info(game.i18n.format("PTU.DexSheet.Notifications.Owned", { name: Handlebars.helpers.formatSlug(id) }))
        }
        if (isSeen && !positive) {
            this.actor.update({
                [`system.dex.seen`]: this.actor.system.dex.seen.filter(s => s !== id)
            });
            target.classList.remove("seen");
            $(target).find(".dex-item-name").text("???");
            return //ui.notifications.info(game.i18n.format("PTU.DexSheet.Notifications.Unseen", { name: Handlebars.helpers.formatSlug(id) }))
        }
        if (!isSeen && !isOwned && positive) {
            this.actor.update({
                [`system.dex.seen`]: this.actor.system.dex.seen.concat(id)
            });
            target.classList.add("seen");
            $(target).find(".dex-item-name").text(Handlebars.helpers.formatSlug(id));
            return //ui.notifications.info(game.i18n.format("PTU.DexSheet.Notifications.Seen", { name: Handlebars.helpers.formatSlug(id) }))
        }
    }

    async _lazyLoadImages() {
        if (!PTUDexSheet.speciesMap) return;

        const promises = [];
        const elements = this.element.find(".dex-item-img");

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const slug = element.dataset.id ?? element.parentElement?.dataset.id;
            if (!slug) continue;

            const species = PTUDexSheet.speciesMap.get(slug);
            if (!species) continue;

            const imgPromise = PokemonGenerator.getImage(species)
                .then(img => PTUDexSheet.speciesArtCache.set(slug, img ?? "/systems/ptu/static/css/images/icons/dex_icon.png"))
                .then(() => this.element.find(`.dex-item[data-id="${slug}"] .dex-item-img img`).attr("src", PTUDexSheet.speciesArtCache.get(slug)))

            promises.push(imgPromise);

            if (promises.length >= 50 || i === elements.length - 1) {
                await Promise.all(promises);
                promises.length = 0;
            }
        }
    }

    async _updateObject(event, formData) {
        this.hideUnknown = formData.hideUnknown;
        this.hideSeen = formData.hideSeen;
        this.hideOwned = formData.hideOwned;
        this.filter = formData.search;
        this.render(true);
    }
}

export { PTUDexSheet }