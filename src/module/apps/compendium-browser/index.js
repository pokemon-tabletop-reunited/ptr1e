import { sluggify } from "../../../util/misc.js";
import { Progress } from "../../../util/progress.js";
import * as browserTabs from "./tabs/index.js";
import noUiSlider from "../../../../static/js/nouislider.mjs"
class PackLoader {

    /**
     * @typedef {object} PackRecordObject
     * @property {CompendiumCollection} pack
     * @property {CollectionIndex} index
     */

    loadedPacks = {
        /** @type {Record<string, PackRecordObject | undefined>}} */
        Actor: {},
        /** @type {Record<string, PackRecordObject | undefined>}} */
        Item: {}
    };
    loadedSources = [];

    constructor() {
        this.sourcesSettings = game.settings.get("ptu", "compendiumBrowserSources");
    }

    /**
     * @param {"Actor" | "Item"} documentType 
     * @param {string[]} packs 
     * @param {string[]} indexFields 
     */
    async *loadPacks(documentType, packs, indexFields) {
        this.loadedPacks[documentType] ??= {};
        const sources = this.#getSources();

        const progress = new Progress({ steps: packs.length });
        for (const packId of packs) {
            let data = this.loadedPacks[documentType][packId];
            if (data) {
                const { pack } = data;
                progress.advance(game.i18n.format("PTU.CompendiumBrowser.ProgressBar.LoadingPack", { pack: pack?.metadata.label ?? "" }));
            }
            else {
                const pack = game.packs.get(packId);
                if (!pack) {
                    progress.advance("");
                    continue;
                }
                progress.advance(game.i18n.format("PTU.CompendiumBrowser.ProgressBar.LoadingPack", { pack: pack.metadata.label }));
                if (pack.documentName !== documentType) continue;

                const index = await pack.getIndex({ fields: indexFields });
                const firstResult = index.contents.at(0) ?? {};
                if (firstResult.system) {
                    const filteredIndex = this.#createFilteredIndex(index, sources);
                    data = { pack, index: filteredIndex };
                    this.loadedPacks[documentType][packId] = data;
                }
                else {
                    ui.notifications.warn(game.i18n.format("PTU.CompendiumBrowser.PackNotLoaded", { pack: pack.collection }));
                    continue;
                }
            }
            yield data;
        }
        progress.close(game.i18n.localize("PTU.CompendiumBrowser.ProgressBar.LoadingComplete"));
    }

    /**
     * @param {string[]} packs 
     */
    async updateSources(packs) {
        await this.#loadSources(packs);

        for (const source of this.loadedSources) {
            const slug = sluggify(source);
            if (this.sourcesSettings.sources[slug] === undefined) {
                this.sourcesSettings.sources[slug] = { name: source, load: this.sourcesSettings.showUnknownSources };
            }
        }
    }

    reset() {
        this.loadedPacks = { Actor: {}, Item: {} };
        this.loadedSources = [];
    }

    /**
     * @param {string[]} packs 
     */
    async hardReset(packs) {
        this.reset();
        this.sourcesSettings = {
            ignoreAsGM: true,
            showEmptySources: true,
            showUnknownSources: true,
            sources: {}
        };
        await this.updateSources(packs);
    }

    /**
     * @returns {Set<string>}
     */
    #getSources() {
        const sources = new Set();
        for (const source of Object.values(this.sourcesSettings.sources)) {
            if (source?.load) {
                sources.add(source.name);
            }
        }
        return sources;
    }

    /**
     * @param {string[]} packs 
     */
    async #loadSources(packs) {
        const progress = new Progress({ steps: packs.length });
        const loadedSources = new Set();
        const indexFields = ["system.details.source.value", "system.source.value"];
        const knownDocumentTypes = ["Actor", "Item"];

        for (const packId of packs) {
            const pack = game.packs.get(packId);
            if (!pack || !knownDocumentTypes.includes(pack.documentName)) {
                progress.advance("");
                continue;
            }
            progress.advance(game.i18n.format("PTU.CompendiumBrowser.ProgressBar.LoadingPack", { pack: pack?.metadata.label ?? "" }));
            const index = await pack.getIndex({ fields: indexFields });

            for (const element of index) {
                const source = this.#getSourceFromDocument(element);
                if (source) {
                    loadedSources.add(source);
                }
            }
        }
        progress.close(game.i18n.localize("PTU.CompendiumBrowser.ProgressBar.LoadingComplete"));
        const loadedSourcesArray = Array.from(loadedSources).sort();
        this.loadedSources = loadedSourcesArray;
    }

    /**
     * @param {CompendiumIndex} index 
     * @param {Set<string>} sources 
     * @returns {CompendiumIndex}
     */
    #createFilteredIndex(index, sources) {
        if (sources.size === 0) return index;

        if (game.user.isGM && this.sourcesSettings.ignoreAsGM) {
            return index;
        }

        const filteredIndex = new Collection();
        const knownSources = Object.values(this.sourcesSettings.sources).map(value => value?.name);

        for (const document of index) {
            const source = this.#getSourceFromDocument(document);
            const blank = source === null || source === undefined || source.trim() === "";
            if ((blank && this.sourcesSettings.showEmptySources) || sources.has(source) || (this.sourcesSettings.showUnknownSources && !knownSources.includes(source))) {
                filteredIndex.set(document._id, document);
            }
        }
        return filteredIndex;
    }

    /**
     * @param {CompendiumIndexData} document 
     * @returns {string}
     */
    #getSourceFromDocument(document) {
        // There are two possible fields where the source can be, check them in order
        if (document.system?.details?.source?.value) {
            return document.system.details.source.value;
        }

        if (document.system?.source?.value) {
            return document.system.source.value;
        }

        return "";
    }
}

class CompendiumBrowser extends Application {
    constructor(options = {}) {
        super(options);

        this.packLoader = new PackLoader();

        this.settings = game.settings.get("ptu", "compendiumBrowserPacks");
        this.navigationTab = this.hookTab();
        this.tabs = {
            abilities: new browserTabs.Abilities(this),
            edges: new browserTabs.Edges(this),
            feats: new browserTabs.Feats(this),
            items: new browserTabs.Items(this),
            moves: new browserTabs.Moves(this),
            pokeEdges: new browserTabs.PokeEdges(this),
            species: new browserTabs.Species(this),
            effects: new browserTabs.Effects(this),
        }
        this.dataTabsList = Object.keys(this.tabs);

        this.initCompendiumList();
    }

    get title() {
        return game.i18n.localize("PTU.CompendiumBrowser.Title");
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "compendium-browser",
            classes: [],
            template: "systems/ptu/static/templates/apps/compendium-browser/compendium-browser.hbs",
            width: 800,
            height: 700,
            resizable: true,
            dragDrop: [{ dragSelector: "ul.item-list > li.item" }],
            tabs: [
                {
                    navSelector: "nav",
                    contentSelector: "section.content",
                    initial: "landing-page",
                },
            ],
            scrollY: [".control-area", ".item-list"],
        };
    }

    /** Reset initial filtering */
    async close(options) {
        for (const tab of Object.values(this.tabs)) {
            tab.filterData.search.text = "";
        }
        await super.close(options);
    }

    hookTab() {
        const navigationTab = this._tabs.at(0);
        const tabCallback = navigationTab.callback;
        navigationTab.callback = async (event, tabs, active) => {
            tabCallback?.(event, tabs, active);
            await this.loadTab(active);
        }
        return navigationTab;
    }

    initCompendiumList() {
        const settings = {
            abilities: {},
            capabilities: {},
            edges: {},
            effects: {},
            feats: {},
            items: {},
            moves: {},
            pokeEdges: {},
            species: {}
        }

        const loadDefault = {
            "ptu.abilities": true,
            "ptu.capabilities": false,
            "ptu.edges": true,
            "ptu.effects": true,
            "ptu.feats": true,
            "ptu.items": true,
            "ptu.moves": true,
            "ptu.poke-edges": true,
            "ptu.species": true
        }

        for (const pack of game.packs) {
            const types = new Set(pack.index.map(entry => entry.type));
            if (types.size === 0) continue;

            if (types.has("ability")) {
                const load = this.settings.abilities?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.abilities[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("capability")) {
                const load = this.settings.capabilities?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.capabilities[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("edge")) {
                const load = this.settings.edges?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.edges[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("effect")) {
                const load = this.settings.effects?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.effects[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("feat")) {
                const load = this.settings.feats?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.feats[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("item")) {
                const load = this.settings.items?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.items[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("move")) {
                const load = this.settings.moves?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.moves[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("pokeedge")) {
                const load = this.settings.pokeEdges?.[pack.collection]?.load ?? !!loadDefault[pack.collection]
                settings.pokeEdges[pack.collection] = { load, name: pack.metadata.label };
            }
            if (types.has("species")) {
                const load = this.settings.species?.[pack.collection]?.load ?? !!loadDefault[pack.collection];
                settings.species[pack.collection] = { load, name: pack.metadata.label };
            }
        }

        for (const tab of this.dataTabsList) {
            settings[tab] = Object.fromEntries(
                Object.entries(settings[tab]).sort(([_collectionA, dataA], [_collectionB, dataB]) => (dataA?.name ?? "") > (dataB?.name ?? "") ? 1 : -1)
            )
        }

        this.settings = settings;
    }

    /**
     * @param {TabName} tabName 
     * @param {BrowserFilter} filter 
     */
    async openTab(tabName, filter) {
        this.activeTab = tabName;
        if (tabName !== "settings" && filter) {
            return this.tabs[tabName].open(filter);
        }
        return this.loadTab(tabName);
    }

    /**
     * @param {TabName} tabName 
     */
    async loadTab(tabName) {
        this.activeTab = tabName;

        if (tabName === "settings") {
            await this.packLoader.updateSources(this.loadedPacksAll());
            return await this.render(true);
        }

        if (!this.dataTabsList.includes(tabName)) {
            throw new Error(`Unknown tab name: ${tabName}`);
        }

        const currentTab = this.tabs[tabName];

        if (!currentTab.isInitialized) {
            await currentTab.init();
        }

        await this.render(true, { focus: true });
    }

    /**
     * @param {TabName} tab 
     * @returns {string[]}
     */
    loadedPacks(tab) {
        if (tab === "settings") return [];
        return Object.entries(this.settings[tab] ?? []).flatMap(([collection, data]) => data?.load ? [collection] : []);
    }

    /**
     * @returns {string[]}
     */
    loadedPacksAll() {
        const loadedPacks = new Set();
        for (const tabName of this.dataTabsList) {
            this.loadedPacks(tabName).forEach(pack => loadedPacks.add(pack));
        }
        return Array.from(loadedPacks).sort();
    }

    activateListeners($html) {
        super.activateListeners($html);
        const html = $html[0];
        const activeTabName = this.activeTab;

        // Set the navigation tab. This is only needed when the browser is openend
        // with CompendiumBrowserTab#open
        if (this.navigationTab.active !== activeTabName) {
            this.navigationTab.activate(activeTabName);
        }

        // Settings Tab
        if (activeTabName === "settings") {
            const form = html.querySelector(".compendium-browser-settings form");
            if (form) {
                html.querySelector(".compendium-browser-settings button.save-settings")?.addEventListener("click", async () => {
                    const formData = foundry.utils.flattenObject(new FormDataExtended(form).object);
                    for (const [t, packs] of Object.entries(this.settings)) {
                        for (const [key, pack] of Object.entries(packs)) {
                            pack.load = formData[key] ?? pack.load;
                        }
                    }
                    await game.settings.set("ptu", "compendiumBrowserPacks", this.settings);

                    // for (const [key, source] of Object.entries(this.packLoader.sourcesSettings.sources)) {
                    //     if (!source || source.name === null || source.name === undefined || source.name.trim() === "") {
                    //         delete this.packLoader.sourcesSettings.sources[key]; // just to make sure we clean up
                    //         continue;
                    //     }
                    //     source.load = formData.has(`source-${key}`);
                    // }

                    // this.packLoader.sourcesSettings.showEmptySources = formData.has("show-empty-sources");
                    // this.packLoader.sourcesSettings.showUnknownSources = formData.has("show-unknown-sources");
                    // this.packLoader.sourcesSettings.ignoreAsGM = formData.has("ignore-as-gm");
                    // await game.settings.set("ptu", "compendiumBrowserSources", this.packLoader.sourcesSettings);

                    await this.#resetInitializedTabs();
                    this.render(true);
                    ui.notifications.info("Settings saved");
                });

                // const sourceSearch = form.querySelector("input[data-element=setting-sources-search]");
                // const sourceToggle = form.querySelector("input[data-action=setting-sources-toggle-visible]");
                // const sourceSettings = form.querySelectorAll("label[data-element=setting-source]");

                // sourceSearch?.addEventListener("input", () => {
                //     const value = sourceSearch.value?.trim().toLocaleLowerCase(game.i18n.lang);

                //     for (const element of sourceSettings) {
                //         const name = element.dataset.name?.toLocaleLowerCase(game.i18n.lang);
                //         const shouldBeHidden = !(value === null || value === undefined || value.trim() === "") && !(name === null || name === undefined || name.trim() === "") && !name.includes(value);

                //         element.classList.toggle("hidden", shouldBeHidden);
                //     }

                //     if (sourceToggle) {
                //         sourceToggle.checked = false;
                //     }
                // });

                // sourceToggle?.addEventListener("click", () => {
                //     for (const element of sourceSettings) {
                //         const checkbox = element.querySelector("input[type=checkbox]");
                //         if (!element.classList.contains("hidden") && checkbox) {
                //             checkbox.checked = sourceToggle.checked;
                //         }
                //     }
                // });
            }
            return;
        }

        const currentTab = this.tabs[activeTabName];
        const controlArea = html.querySelector("div.control-area");
        if (!controlArea) return;

        // Search field
        const search = controlArea.querySelector("input[name=textFilter]");
        if (search) {
            search.addEventListener("input", () => {
                currentTab.filterData.search.text = search.value;
                this.#clearScrollLimit();
                this.#renderResultList({ replace: true });
            });
        }

        // Sort item list
        const sortContainer = controlArea.querySelector("div.sortcontainer");
        if (sortContainer) {
            const order = sortContainer.querySelector("select.order");
            if (order) {
                order.addEventListener("change", () => {
                    const orderBy = order.value ?? "name";
                    currentTab.filterData.order.by = orderBy;
                    this.#clearScrollLimit(true);
                });
            }
            const directionAnchor = sortContainer.querySelector("a.direction");
            if (directionAnchor) {
                directionAnchor.addEventListener("click", () => {
                    const direction = directionAnchor.dataset.direction ?? "asc";
                    currentTab.filterData.order.direction = direction === "asc" ? "desc" : "asc";
                    this.#clearScrollLimit(true);
                });
            }
        }

        if (activeTabName === "items") {
            const typeSelect = controlArea.querySelector("select[name=type]");
            if (typeSelect) typeSelect.addEventListener("change", () => {
                if (!(currentTab instanceof browserTabs.Items)) return;
                currentTab.filterData.selects.type.selected = typeSelect.value;
                this.#clearScrollLimit(true);
            });
        }
        if (activeTabName === "moves") {
            const typeSelect = controlArea.querySelector("select[name=type]");
            if (typeSelect) typeSelect.addEventListener("change", () => {
                if (!(currentTab instanceof browserTabs.Moves)) return;
                currentTab.filterData.selects.type.selected = typeSelect.value;
                this.#clearScrollLimit(true);
            });
            const categorySelect = controlArea.querySelector("select[name=category]");
            if (categorySelect) categorySelect.addEventListener("change", () => {
                if (!(currentTab instanceof browserTabs.Moves)) return;
                currentTab.filterData.selects.category.selected = categorySelect.value;
                this.#clearScrollLimit(true);
            });
        }

        // Clear all filters button
        controlArea.querySelector("button.clear-filters")?.addEventListener("click", () => {
            this.#resetFilters();
            this.#clearScrollLimit(true);
        });

        const objectHasKey = (obj, key) => (typeof key === "string" || typeof key === "number") && key in obj;

        // Filters
        const filterContainers = controlArea.querySelectorAll("div.filtercontainer");
        for (const container of Array.from(filterContainers)) {
            const { filterType, filterName } = container.dataset;
            // Clear this filter button
            container.querySelector("button[data-action=clear-filter]")?.addEventListener("click", (event) => {
                event.stopImmediatePropagation();
                switch (filterType) {
                    case "checkboxes": {
                        const checkboxes = currentTab.filterData.checkboxes;
                        if (objectHasKey(checkboxes, filterName)) {
                            for (const option of Object.values(checkboxes[filterName].options)) {
                                option.selected = false;
                            }
                            checkboxes[filterName].selected = [];
                            this.render(true);
                        }
                        break;
                    }
                    case "ranges": {
                        if (currentTab.isOfType("equipment")) {
                            const ranges = currentTab.filterData.ranges;
                            if (objectHasKey(ranges, filterName)) {
                                ranges[filterName].values = currentTab.defaultFilterData.ranges[filterName].values;
                                ranges[filterName].changed = false;
                                this.render(true);
                            }
                        }
                    }
                }
            });

            // Toggle visibility of filter container
            const title = container.querySelector("div.title");
            title?.addEventListener("click", () => {
                const toggleFilter = (filter) => {
                    filter.isExpanded = !filter.isExpanded;
                    const contentElement = title.nextElementSibling;
                    if (contentElement instanceof HTMLElement) {
                        filter.isExpanded
                            ? (contentElement.style.display = "")
                            : (contentElement.style.display = "none");
                    }
                };
                switch (filterType) {
                    case "checkboxes": {
                        if (objectHasKey(currentTab.filterData.checkboxes, filterName)) {
                            toggleFilter(currentTab.filterData.checkboxes[filterName]);
                        }
                        break;
                    }
                    case "ranges": {
                        if (objectHasKey(currentTab.filterData.ranges, filterName)) {
                            toggleFilter(currentTab.filterData.ranges[filterName]);
                        }
                        break;
                    }
                    case "sliders": {
                        if (objectHasKey(currentTab.filterData.sliders, filterName)) {
                            toggleFilter(currentTab.filterData.sliders[filterName]);
                        }
                        break;
                    }
                }
            });

            if (filterType === "checkboxes") {
                container.querySelectorAll("input[type=checkbox]").forEach((checkboxElement) => {
                    checkboxElement.addEventListener("click", () => {
                        if (objectHasKey(currentTab.filterData.checkboxes, filterName)) {
                            const optionName = checkboxElement.name;
                            const checkbox = currentTab.filterData.checkboxes[filterName];
                            const option = checkbox.options[optionName];
                            option.selected = !option.selected;
                            option.selected
                                ? checkbox.selected.push(optionName)
                                : (checkbox.selected = checkbox.selected.filter((name) => name !== optionName));
                            this.#clearScrollLimit(true);
                        }
                    });
                });
            }

            if (filterType === "ranges") {
                container.querySelectorAll("input[name*=Bound]").forEach((range) => {
                    range.addEventListener("keyup", (event) => {
                        if (event.key !== "Enter") return;
                        const ranges = currentTab.filterData.ranges;
                        if (ranges && objectHasKey(ranges, filterName)) {
                            const range = ranges[filterName];
                            const lowerBound =
                                container.querySelector("input[name*=lowerBound]")?.value ?? "";
                            const upperBound =
                                container.querySelector("input[name*=upperBound]")?.value ?? "";
                            const values = currentTab.parseRangeFilterInput(filterName, lowerBound, upperBound);
                            range.values = values;
                            range.changed = true;
                            this.#clearScrollLimit(true);
                        }
                    });
                });
            }

            if (filterType === "multiselects") {
                // Multiselects using tagify
                const multiselects = currentTab.filterData.multiselects;
                if (!multiselects) continue;
                if (objectHasKey(multiselects, filterName)) {
                    const multiselect = container.querySelector(`input[name=${filterName}][data-tagify-select]`);
                    if (!multiselect) continue;
                    const data = multiselects[filterName];

                    const tagify = new Tagify(multiselect, {
                        enforceWhitelist: true,
                        keepInvalidTags: false,
                        editTags: false,
                        tagTextProp: "label",
                        dropdown: {
                            enabled: 0,
                            fuzzySearch: false,
                            mapValueTo: "label",
                            maxItems: data.options.length,
                            searchKeys: ["label"],
                        },
                        whitelist: data.options,
                        transformTag(tagData) {
                            const selected = data.selected.find((s) => s.value === tagData.value);
                            if (selected?.not) {
                                tagData.class = "conjunction-not";
                            }
                        },
                    });

                    tagify.on("click", (event) => {
                        const target = event.detail.event.target;
                        if (!target) return;

                        const value = event.detail.data.value;
                        const selected = data.selected.find((s) => s.value === value);
                        if (selected) {
                            const current = !!selected.not;
                            selected.not = !current;
                            this.render();
                        }
                    });
                    tagify.on("change", (event) => {
                        const selections = JSON.parse(event.detail.value || "[]");
                        const isValid =
                            Array.isArray(selections) &&
                            selections.every((s) => typeof s === "object" && typeof s["value"] === "string");

                        if (isValid) {
                            data.selected = selections;
                            this.render();
                        }
                    });

                    for (const element of container.querySelectorAll(`input[name=${filterName}-filter-conjunction]`)) {
                        element.addEventListener("change", () => {
                            const value = element.value;
                            if (value === "and" || value === "or") {
                                data.conjunction = value;
                                this.render();
                            }
                        });
                    }
                }
            }

            if (filterType === "sliders") {
                // Slider filters
                const sliders = currentTab.filterData.sliders;
                if (!sliders) continue;

                if (objectHasKey(sliders, filterName)) {
                    const sliderElement = container.querySelector(`div.slider-${filterName}`);
                    if (!sliderElement) continue;
                    const data = sliders[filterName];

                    const slider = noUiSlider.create(sliderElement, {
                        range: {
                            min: data.values.lowerLimit,
                            max: data.values.upperLimit,
                        },
                        start: [data.values.min, data.values.max],
                        tooltips: {
                            to(value) {
                                return Math.floor(value).toString();
                            },
                        },
                        connect: [false, true, false],
                        behaviour: "snap",
                        step: data.values.step,
                    });

                    slider.on("change", (values) => {
                        const [min, max] = values.map((value) => Number(value));
                        data.values.min = min;
                        data.values.max = max;

                        const $minLabel = $html.find(`label.${name}-min-label`);
                        const $maxLabel = $html.find(`label.${name}-max-label`);
                        $minLabel.text(min);
                        $maxLabel.text(max);

                        this.#clearScrollLimit(true);
                    });

                    // Set styling
                    sliderElement.querySelectorAll(".noUi-handle").forEach((element) => {
                        element.classList.add("handle");
                    });
                    sliderElement.querySelectorAll(".noUi-connect").forEach((element) => {
                        element.classList.add("range_selected");
                    });
                }
            }
        }

        const list = html.querySelector(".tab.active ul.item-list");
        if (!list) return;
        list.addEventListener("scroll", async () => {
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 5) {
                const currentValue = currentTab.scrollLimit;
                const maxValue = currentTab.totalItemCount ?? 0;
                if (currentValue < maxValue) {
                    currentTab.scrollLimit = Math.clamp(currentValue + 100, 100, maxValue);
                    this.#renderResultList({ list, start: currentValue })
                }
            }
        });

        this.#renderResultList({ list });
    }

    async #renderResultList({ list, start = 0, replace = false } = {}) {
        /** @type {import('./tabs/base.js').CompendiumBrowserTab} */
        const currentTab = this.activeTab !== "settings" ? this.tabs[this.activeTab] : null;
        const html = this.element[0]
        if (!currentTab) return;

        if (!list) {
            const listElement = html.querySelector(".tab.active ul.item-list");
            if (!listElement) return;
            list = listElement;
        }

        const newResults = await currentTab.renderResult(start);
        this.#activateResultListeners(newResults);

        const fragment = document.createDocumentFragment();
        fragment.append(...newResults);
        if (replace) {
            list.replaceChildren(fragment);
        }
        else {
            list.append(fragment);
        }

        for (const dragDropHandler of this._dragDrop) {
            dragDropHandler.bind(html);
        }
    }

    /**
     * @param {HTMLLIElement[]} liElements 
     */
    #activateResultListeners(liElements) {
        for (const liElement of liElements) {
            const { entryUuid } = liElement.dataset;
            if (!entryUuid) continue;

            const nameAnchor = liElement.querySelector("div.name > a");
            if (nameAnchor) {
                nameAnchor.addEventListener("click", async () => {
                    const document = await fromUuid(entryUuid);
                    if (document?.sheet) document.sheet.render(true);
                });
            }
        }
    }

    _canDragStart() {
        return true;
    }

    _canDragDrop() {
        return true;
    }

    _onDragStart(event) {
        this.element.animate({ opacity: 0.125 }, 250);

        const item = $(event.currentTarget)[0];
        event.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
                type: item.dataset.type,
                uuid: item.dataset.entryUuid,
            })
        );
        item.addEventListener(
            "dragend",
            () => {
                window.setTimeout(() => {
                    this.element.animate({ opacity: 1 }, 250, () => {
                        this.element.css({ pointerEvents: "" });
                    });
                }, 500);
            },
            { once: true }
        );
    }

    _onDragOver(event) {
        super._onDragOver(event);
        this.element.css({ pointerEvents: "none" });
    }

    async #resetInitializedTabs() {
        for (const tab of Object.values(this.tabs)) {
            if (tab.isInitialized) {
                await tab.init();
                tab.scrollLimit = 100;
            }
        }
    }

    #resetFilters() {
        const activeTab = this.activeTab;
        if (activeTab !== "settings") {
            this.tabs[activeTab].resetFilters();
        }
    }

    #clearScrollLimit(render = false) {
        const tab = this.activeTab;
        if (tab === "settings") return;

        const list = this.element[0].querySelector(".tab.active ul.item-list");
        if (!list) return;
        list.scrollTop = 0;
        this.tabs[tab].scrollLimit = 100;

        if (render) {
            this.render();
        }
    }

    getData() {
        const activeTab = this.activeTab;
        if (activeTab === "settings") return {
            tab: "settings",
            user: game.user,
            settings: {
                settings: this.settings,
                sources: this.packLoader.sourcesSettings,
            }
        }

        const tab = this.tabs[activeTab];
        if (tab) return {
            user: game.user,
            [activeTab]: {
                filterData: tab.filterData
            },
            scrollLimit: tab.scrollLimit,
            tab: activeTab
        }

        return {
            user: game.user
        }
    }

    /**
     * @typedef TabName
     * @type {"abilities" | "capabilities" | "edges" | "effects" | "feats" | "items" | "moves" | "pokeEdges" | "species" | "settings"} 
     */

    /**
     * @typedef BrowserFilter
     */
}

export { PackLoader, CompendiumBrowser }