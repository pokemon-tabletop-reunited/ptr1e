import { sluggify } from "../../../../util/misc.js";
import { CompendiumBrowserTab } from "./base.js";

export class CompendiumBrowserFeatsTab extends CompendiumBrowserTab {
    constructor(browser) {
        super(browser);

        this.searchFields = ["name", "prerequisites.label", "prerequisites.tier", "class"]
        this.storeFields = ["name", "uuid", "type", "source", "img", "prerequisites", "class", "classPretty", "keywords"];

        this.index = ["img", "system.source.value", "system.prerequisites", "system.class", "system.keywords"];

        this.filterData = this.prepareFilterData();
    }

    get tabName() {
        return "feats"
    }

    get templatePath() {
        return "systems/ptu/static/templates/apps/compendium-browser/partials/feats.hbs"
    }

    async loadData() {
        const feats = [];
        const indexFields = foundry.utils.duplicate(this.index);
        const sources = new Set();

        const classes = new Set();
        const featNames = new Set();
        const allKeywordsSeen = new Set();

        for await (const { pack, index } of this.browser.packLoader.loadPacks(
            "Item",
            this.browser.loadedPacks(this.tabName),
            indexFields
        )) {
            for (const featData of index) {
                if (featData.type !== "feat") continue;
                if (!this.hasAllIndexFields(featData, indexFields)) continue;

                const source = featData.system.source?.value ?? "";
                const sourceSlug = sluggify(source);
                if (source) sources.add(source);

                const isClass = featData.system.keywords.includes("Class");
                const _class = isClass ? featData.name.trim(): (featData.system.class?.trim() ?? "");
                const prerequisites = featData.system?.prerequisites ?? "";

                for(const keyword of featData.system.keywords) {
                    allKeywordsSeen.add(keyword);
                }

                feats.push({
                    name: featData.name,
                    type: featData.type,
                    img: featData.img,
                    uuid: `Compendium.${pack.collection}.${featData._id}`,
                    source: sourceSlug,
                    prerequisites: this.#prerequisitesStringToEntries(prerequisites),
                    class: sluggify(_class),
                    classPretty: _class,
                    keywords: featData.system.keywords
                })
                if (_class) classes.add(_class);

                featNames.add(featData.name);
            }
        }

        for (const feat of feats) {
            const prereqs = [];
            for (const prereq of feat.prerequisites) {
                if (classes.has(prereq.label.toLowerCase().capitalize())) {
                    feat.class ||= prereq.label;
                    feat.classPretty ||= prereq.label;
                    continue;
                }
                if (featNames.has(prereq.label)) prereq.feat = true;
                prereqs.push(prereq);
            }
            feat.prerequisites = prereqs;
        }

        this.indexData = feats;

        // Set filters if necessary
        this.filterData.checkboxes.class.options = this.#generateCheckboxOptions([...classes].sort());
        this.filterData.checkboxes.source.options = this.generateSourceCheckboxOptions(sources);
        this.filterData.multiselects.keywords.options = this.filterOptionsFromSet(allKeywordsSeen)
    }

    #prerequisitesStringToEntries(prerequisites) {
        const tiers = new Set(["untrained", "novice", "adept", "expert", "master"]);

        const entries = [];
        for (const prereq of prerequisites) {
            if(prereq === 'Rune Master') continue;
            let tierFound = false;
            const entry = prereq.split(" ").map(p => p.trim()).reduce((acc, curr) => {
                if (!tierFound && tiers.has(curr.toLowerCase())) {
                    acc.tier = curr;
                    acc.label = acc.label ? `${curr} ${acc.label}` : curr;
                    tierFound = true;
                } else {
                    acc.label = acc.label ? `${acc.label} ${curr}` : curr;
                }
                return acc;
            }, { label: "", tier: "" });

            if (entry.label) entries.push(entry);
        }

        return entries;
    }

    #generateCheckboxOptions(classSet) {
        return classSet.reduce((result, _class) => ({
            ...result,
            [sluggify(_class)]: {
                label: _class,
                selected: false
            }
        }), {});
    }

    filterIndexData(entry) {
        const { multiselects, checkboxes } = this.filterData;

        if (checkboxes.source.selected.length) {
            if (!checkboxes.source.selected.includes(entry.source)) return false;
        }

        // Class
        if (checkboxes.class.selected.length) {
            if (!checkboxes.class.selected.includes(entry.class.toLowerCase())) return false;
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
                class: {
                    isExpanded: false,
                    label: "PTU.CompendiumBrowser.FilterOptions.Class",
                    options: {},
                    selected: []
                },
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
                    selected: [{value: 'Obsolete', label: 'Obsolete', not: true}, {value: "Legacy", label: "Legacy", not: true}]
                }
            },
            order: {
                by: "class",
                direction: "asc",
                options: {
                    class: "PTU.CompendiumBrowser.FilterOptions.Class",
                    name: "PTU.CompendiumBrowser.FilterOptions.Name"
                }
            },
            search: {
                text: ""
            }
        }
    }
} 