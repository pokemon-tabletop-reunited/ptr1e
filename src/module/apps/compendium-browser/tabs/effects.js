import { sluggify } from "../../../../util/misc.js";
import { CompendiumBrowserTab } from "./base.js";

export class CompendiumBrowserEffectsTab extends CompendiumBrowserTab {
    constructor(browser) {
        super(browser);

        this.searchFields = ["name"]
        this.storeFields = ["name", "uuid", "type", "source", "img", "cost", "subtype", "keywords"];

        this.index = ["img", "system.source.value", "system.keywords"];

        this.filterData = this.prepareFilterData();
    }

    get tabName() {
        return "effects"
    }

    get templatePath() {
        return "systems/ptu/static/templates/apps/compendium-browser/partials/effects.hbs"
    }

    async loadData() {
        const items = [];
        const indexFields = foundry.utils.duplicate(this.index);
        const sources = new Set();
        const allKeywordsSeen = new Set();

        for await (const { pack, index } of this.browser.packLoader.loadPacks(
            "Item",
            this.browser.loadedPacks(this.tabName),
            indexFields
        )) {
            for (const itemData of index) {
                if (!["effect", "condition"].includes(itemData.type)) continue;
                if (!this.hasAllIndexFields(itemData, indexFields)) continue;

                const source = itemData.system.source?.value ?? "";
                const sourceSlug = sluggify(source);
                if (source) sources.add(source);

                for(const keyword of itemData.system.keywords) {
                    allKeywordsSeen.add(keyword);
                }

                items.push({
                    name: itemData.name,
                    type: itemData.type,
                    img: itemData.img,
                    uuid: `Compendium.${pack.collection}.${itemData._id}`,
                    source: sourceSlug,
                    keywords: itemData.system.keywords
                })
            }
        }

        this.indexData = items;

        // Set filters if necessary
        this.filterData.checkboxes.source.options = this.generateSourceCheckboxOptions(sources);
        this.filterData.multiselects.keywords.options = this.filterOptionsFromSet(allKeywordsSeen)
    }

    filterIndexData(entry) {
        const { multiselects, checkboxes } = this.filterData;

        if (checkboxes.source.selected.length) {
            if (!checkboxes.source.selected.includes(entry.source)) return false;
        }

        if (!this.isEntryHonoringMultiselect(multiselects.keywords, entry.keywords)) return false;

        return true;
    }

    filterOptionsFromSet(set) {
        return [...set].map(value => ({ value, label: value })).sort((a, b) => a.label.localeCompare(b.label));
    }

    /**
     *  @param multiselectFilter - the `selected` from a filter, e.g. `filterData.multiselects.types`
     *  @param entrySetToCheck - the set of an entry corresponding to the filter, e.g. `entry.types`
     *  @return {boolean} - True if the entry honors the filter, i.e. would be valid result
    */
    isEntryHonoringMultiselect(multiselectFilter, entrySetToCheck) {
        const selected = multiselectFilter.selected.filter(s => !s.not).map(s => s.value);
        const notSelected = multiselectFilter.selected.filter(s => s.not).map(s => s.value);
        if (selected.length || notSelected.length) {
            if (notSelected.some(ns => entrySetToCheck.some(e => sluggify(e) === sluggify(ns)))) return false;
            const fulfilled =
                multiselectFilter.conjunction === "and"
                    ? selected.every(s => entrySetToCheck.some(e => sluggify(e) === sluggify(s)))
                    : selected.some(s => entrySetToCheck.some(e => sluggify(e) === sluggify(s)));
            if (!fulfilled) return false;
        }
        return true;
    }

    prepareFilterData() {
        return {
            checkboxes: {
                source: {
                    isExpanded: false,
                    label: "PTU.CompendiumBrowser.FilterOptions.Source",
                    options: {},
                    selected: []
                }
            },
            multiselects: {
                keywords: {
                    conjunction: "and",
                    label: "PTU.CompendiumBrowser.FilterOptions.Keywords",
                    options: [],
                    selected: [{value: 'Obsolete', label: 'Obsolete', not: true}]
                }
            },
            order: {
                by: "name",
                direction: "asc",
                options: {
                    name: "PTU.CompendiumBrowser.FilterOptions.Name",
                }
            },
            search: {
                text: ""
            }
        }
    }
} 