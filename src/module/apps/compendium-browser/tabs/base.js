import { sluggify } from '../../../../util/misc.js';

export class CompendiumBrowserTab {
    #domParser = new DOMParser();

    /**
     * @param {import('../index.js').CompendiumBrowser} browser 
     */
    constructor(browser) {
        this.browser = browser;

        this.isInitialized = false;
        this.totalItemCount = 0;
        this.scrollLimit = 100;
        /** @type {string[]} */
        this.searchFields = [];
        /** @type {string[]} */
        this.storeFields = [];
        this.indexData = [];
        this.defaultFilterData = null;
        this.filterData = null;
    }

    /**
     * @abstract
     */
    get tabName() {
        throw new Error("Not implemented");
    }

    /**
     * @abstract
     */
    get templatePath() {
        throw new Error("Not implemented");
    }

    /** Initialize this this tab */
    async init() {
        await this.loadData();

        this.searchEngine = new MiniSearch({
            fields: this.searchFields,
            idField: "uuid",
            storeFields: this.storeFields,
            searchOptions: { combineWith: "AND", prefix: true, fuzzy: 0.3 },
            extractField: (document, fieldName) => {
                const getValue = (document, path) => {
                    const split = path.split(".");
                    const fullValue = foundry.utils.getProperty(document, path);
                    if(fullValue !== undefined) return fullValue;

                    const currPath = split[0];
                    const currValue = foundry.utils.getProperty(document, currPath);
                    if(currValue === undefined) return undefined;

                    if(Array.isArray(currValue)) {
                        return currValue.map(v => getValue(v, split.slice(1).join("."))).filter(v => v !== undefined);
                    }
                    return getValue(currValue, split.slice(1).join("."));

                }
                return getValue(document, fieldName);
            }
        })
        this.searchEngine.addAll(this.indexData);
        this.defaultFilterData = foundry.utils.deepClone(this.filterData);
        this.isInitialized = true;
    }

    /** 
     * Open this tab
     * @param filter An optional initial filter for this tab
     */
    async open(filter) {
        if (filter) {
            if (!this.isInitialized) throw new Error("Cannot open tab before initializing");
            this.filterData = filter;
        }
        await this.browser.loadTab(this.tabName);
    }

    /** Filter indexData and return slice based on current scrollLimit */
    getIndexData(start) {
        if (!this.isInitialized) throw new Error("Cannot get index data before initializing");

        const currentIndex = (() => {
            const searchText = this.filterData.search.text;
            if (searchText) {
                const searchResult = this.searchEngine.search(searchText);
                return this.sortResult(searchResult.filter(this.filterIndexData.bind(this)));
            }
            return this.sortResult(this.indexData.filter(this.filterIndexData.bind(this)));
        })();
        this.totalItemCount = currentIndex.length;
        return currentIndex.slice(start, this.scrollLimit);
    }

    /** Returns a clean copy of the filterData for this tab. Initializes the tab if necessary. */
    async getFilterData() {
        if (!this.isInitialized) await this.init();
        return foundry.utils.deepClone(this.defaultFilterData);
    }

    resetFilters() {
        this.filterData = foundry.utils.deepClone(this.defaultFilterData);
    }

    isOfType(...types) {
        return types.some(t => this.tabName === t);
    }

    /** @abstract */
    async loadData() {
        throw new Error("Not implemented");
    }

    /** 
     * @abstract 
     * @returns {this["filterData"]}
    */
    async prepareFilterData() {
        throw new Error("Not implemented");
    }

    /**
     * Filter indexData based
     * @abstract
     * @param {CompendiumBrowserIndexData} _entry 
     * @returns {boolean}
     */
    filterIndexData(_entry) {
        return true;
    }

    /**
     * @param {number} start
     * @returns {Promise<HTMLLIElement[]>}
     */
    async renderResult(start) {
        if (!this.templatePath) throw new Error(`Tab ${this.tabName} does not have a valid template path`);

        const indexData = this.getIndexData(start);
        const liElements = [];
        for (const entry of indexData) {
            const htmlString = await foundry.applications.handlebars.renderTemplate(this.templatePath, {
                entry,
                filterData: this.filterData,
            });
            const html = this.#domParser.parseFromString(htmlString, "text/html");
            liElements.push(html.body.firstElementChild);
        }
        return liElements;
    }

    /**
     * Sort result array by name
     * @param {CompendiumBrowserIndexData[]} result 
     */
    sortResult(result) {
        const { order } = this.filterData;
        const lang = game.i18n.lang;
        const sorted = result.sort((a, b) => {
            switch(order.by) {
                case "name": {
                    return a.name.localeCompare(b.name, lang);
                }
                case "cost": {
                    if(a.cost === b.cost) return a.name.localeCompare(b.name, lang);
                    return a.cost - b.cost;
                }
                case "class": {
                    const aClass = a.class.toLowerCase();
                    const aClassIsClass = a.name === aClass;
                    const bClass = b.class.toLowerCase();
                    const bClassIsClass = b.name === bClass;
                    if(aClassIsClass && bClassIsClass) return a.name.localeCompare(b.name, lang);
                    if(aClassIsClass) return -1;
                    if(bClassIsClass) return 1;
                    if(aClass === bClass) return a.name.localeCompare(b.name, lang);
                    return aClass.localeCompare(bClass, lang);
                }
                case "number": {
                    const aNumber = Number(a.number);
                    const bNumber = Number(b.number);
                    if(aNumber === bNumber) return a.name.localeCompare(b.name, lang);
                    return aNumber - bNumber;
                }
                default: return 0;
            }
        });
        return order.direction === "asc" ? sorted : sorted.reverse();
    }

    parseRangeFilterInput(_name, lower, upper) {
        return {
            min: Number(lower) || 0,
            max: Number(upper) || 0,
            inputMin: lower,
            inputMax: upper
        }
    }

    /**
     * Checks if array includes any of the values in other
     * @param {string[]} array 
     * @param {string[]} other 
     * @returns 
     */
    arrayIncludes(array, other) {
        return other.some(value => array.includes(value));
    }

    generateMultiSelectOptions(optionsRecord, sort = true) {
        const options = Object.entries(optionsRecord).map(([value, label]) => ({ value, label: game.i18n.localize(label) }));
        if(sort) return options.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
        return options;
    }

    generateSourceCheckboxOptions(sources) {
        return [...sources].sort().reduce(
            (result,source) => ({
                ...result,
                [sluggify(source)]: {
                    label: source,
                    selected: false
                }
            }),
            {}
        )
    }

    sortedConfig(obj) {
        return Object.fromEntries([...Object.entries(obj)].sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang)));
    }

    hasAllIndexFields(data, indexFields) {
        for(const field of indexFields) {
            if(["system.source", "system.source.value"].includes(field)) continue;
            if(foundry.utils.getProperty(data, field) === undefined) return false;
        }
        return true;
    }
}