/**
 * @param {Array<string>} values ["athlete", "ace-trainer-cr"]
 * @param {string} paramName Parameter name as named in compendium browser filter data, e.g. "types"
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function checkboxes(values, paramName, filterData) {
    const fd = deepClone(filterData)
    fd.checkboxes[paramName].selected = []
    for (const optionName of Object.keys(fd.checkboxes[paramName].options)) {
        fd.checkboxes[paramName].options[optionName].selected = false;
    }
    for (const value of values) {
        if (fd.checkboxes[paramName].options[value] === undefined) continue;
        fd.checkboxes[paramName].options[value].selected = true;
        fd.checkboxes[paramName].selected.push(value)
    }
    return fd
}

/**
 * @param {Array<string>} positives
 * @param {Array<string>} negatives
 * @param {string|null} conjunction "and"|"or"|null
 * @param {string} paramName Parameter name as named in compendium browser filter data, e.g. "types"
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function multiselects(positives, negatives, conjunction, paramName, filterData) {
    const fd = deepClone(filterData)

    if (conjunction) fd.multiselects[paramName].conjunction = conjunction;

    const negs = negatives
        .map(value => {
            return {
                value: value,
                not: true,
                label: filterData.multiselects[paramName].options.find(o => o.value === value).label
            }
        })
    const poss = positives
        .filter(v => !v.startsWith("not-"))
        .map(value => {
            return {
                value: value,
                label: filterData.multiselects[paramName].options.find(o => o.value === value).label
            }
        })

    fd.multiselects[paramName].selected = poss.concat(negs)
    return fd
}

/**
 * @param {Number|null} min
 * @param {string} paramName Parameter name as named in compendium browser filter data, e.g. "types"
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function sliders(min, max, paramName, filterData) {
    const fd = deepClone(filterData)

    if (min === 0 || min) fd.sliders[paramName].values.min = min
    if (max === 0 || max) fd.sliders[paramName].values.max = max

    return fd;
}

/**
 * @param {string} value
 * @param {string} paramName Parameter name as named in compendium browser filter data, e.g. "types"
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function selects(value, paramName, filterData) {
    const fd = deepClone(filterData);
    const legalOptionNames = Object.keys(fd.selects[paramName].options);
    if (legalOptionNames.includes(value)) fd.selects[paramName].selected = value;
    return fd;
}

/**
 * @param {string|null|undefined} by
 * @param {string|null|undefined} dir
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function order(by, dir, filterData) {
    const fd = deepClone(filterData)
    if (by) fd.order.by = by
    if (dir) fd.order.direction = by
    return fd
}

/**
 * @param {Array.<String>|null|undefined} values Words to be searched for
 * @param {Object} filterData Whole filterData of CompendiumBrowserTab. Will not get modified.
 *
 * @return {Object} New Object for filter data, merged with provided
 */
function search(values, filterData) {
    const fd = deepClone(filterData)
    if (values) fd.search.text = values.join(" ")
    return fd
}

export const CompendiumBrowserInlineEnricher = {
    listen: () => {

        // Set up a single Enricher that goes through all(?) content and subs the hand written
        // stuff with an anchor https://discord.com/channels/170995199584108546/722559135371231352/1192834854614737068
        Hooks.on('setup', () => {
            CONFIG.TextEditor.enrichers.push({
                pattern: /@CompSearch\[([A-Za-z]+) ?([0-9a-zA-Z\-= ]*)\](:?{(:?[^\[\]\{\}@]*)?})?/gim,
                enricher: async (match, enrichmentOptions) => {
                    const [tabName, paramString, displayText] = match.slice(1, 4)
                    const tabNameSlug = CONFIG.PTU.util.sluggify(tabName, { camel: "dromedary" })

                    const broken = game?.ptu?.compendiumBrowser 
                        ? game.ptu.compendiumBrowser.tabs[tabNameSlug] === undefined
                        : false;

                    const a = document.createElement("a");
                    a.classList.add("content-link", "compendium-link")

                    a.setAttribute("compendium-link-tab", tabNameSlug)

                    if (broken) {
                        a.classList.add("broken")
                        a.innerHTML = `<i class="fas fa-unlink"></i>`
                        a.insertAdjacentText("beforeend", displayText?.replace("{","")?.replace("}","") || `${tabName} Search` + ` (Broken)`)
                    }
                    else {
                        const pValues = {}
                        pValues["search"] = paramString.split(" ").filter(p => !p.includes("="))
                        const params = paramString.split(" ").filter(p => p.includes("="))
                        for (const param of params) {
                            const [pName, pValue] = param.split(/=(.*)/s).splice(0, 2)
                            if (!pValues[pName]) pValues[pName] = new Set()
                            pValues[pName].add(pValue)
                        }
                        for (const pName of Object.keys(pValues)) {
                            a.setAttribute(`compendium-filter-setting-${pName}`, Array.from(pValues[pName]).join(" "))
                        }
                        a.innerHTML = `<i class="fas fa-th-list"></i>`
                        a.insertAdjacentText("beforeend", displayText?.replace("{","")?.replace("}","") || `${tabName} Search`)
                    }
                    return a;
                }
            });
        })

        // This function adds Event Listeners to the given htmlElement for the compendium-link anchors
        // that the previous enricher will have added to the content
        const activateCompendiumEnricherListener = (htmlElement) => {
            if(!htmlElement) return;
            htmlElement.querySelectorAll(`.compendium-link`).forEach(el => {
                el.addEventListener("click", async (event) => {
                    let tabKey = el.getAttribute("compendium-link-tab")
                    if (tabKey === "pokeedges") tabKey = "pokeEdges";
                    /** @type {CompendiumBrowserTab} */
                    const tab = game.ptu.compendiumBrowser.tabs[tabKey]

                    if (!tab) {
                        if(!event.currentTarget.classList.contains("broken")) {
                            event.currentTarget.classList.add("broken")
                            event.currentTarget.firstChild.outerHTML = `<i class="fas fa-unlink"></i>`
                        };
                        ui.notifications.warn(game.i18n.format("PTU.CompendiumBrowser.Enrichment.UnknownTab", { tabName: tabKey }));
                        return;
                    }

                    const prefix = "compendium-filter-setting-"

                    const allElAttributes = el.getAttributeNames()
                    const params = allElAttributes.filter(pName => pName.startsWith(prefix)).map(s => {
                        return {
                            name: s.substring(26),
                            rawString: el.getAttribute(s),
                            used: false
                        }
                    })
                    const usedParams = []

                    let filterData = await tab.getFilterData()

                    const searchWords = el.getAttribute(prefix + "search")
                    usedParams.push("search")
                    filterData = search(searchWords.split(" "), filterData);

                    const orderBy = el.getAttribute(prefix + "order-by")
                    const orderDir = el.getAttribute(prefix + "order-dir")
                    usedParams.push("order-by")
                    usedParams.push("order-dir")

                    filterData = order(orderBy, orderDir, filterData)

                    if (filterData.checkboxes) {
                        for (const checkboxName of Object.keys(filterData.checkboxes)) {
                            const checkboxString = el.getAttribute(prefix + checkboxName)
                            usedParams.push(checkboxName)
                            if (checkboxString) {
                                filterData = checkboxes(checkboxString.split(" "), checkboxName, filterData)
                            }
                        }
                    }
                    if (filterData.selects) {
                        for (const selectName of Object.keys(filterData.selects)) {
                            const selectString = el.getAttribute(prefix + selectName)
                            usedParams.push(selectName)
                            if (selectString) {
                                filterData = selects(selectString, selectName, filterData)
                            }
                        }
                    }
                    if (filterData.sliders) {
                        for (const sliderName of Object.keys(filterData.sliders)) {
                            const min = el.getAttribute(prefix + `${sliderName}-min`)
                            const max = el.getAttribute(prefix + `${sliderName}-max`)
                            usedParams.push(`${sliderName}-min`)
                            usedParams.push(`${sliderName}-max`)
                            if (min || max) {
                                filterData = sliders(min, max, sliderName, filterData)
                            }
                        }
                    }
                    if (filterData.multiselects) {
                        for (const multiselectName of Object.keys(filterData.multiselects)) {
                            const multString = el.getAttribute(prefix + multiselectName)
                            usedParams.push(multiselectName)
                            if (multString) {
                                const positives = multString.split(" ").filter(s => !s.startsWith("not-"))
                                const negatives = multString.split(" ").filter(s => s.startsWith("not-")).map(s => s.substring(4))
                                const conjunction = el.getAttribute(prefix + `${multiselectName}-logic`)
                                usedParams.push(`${multiselectName}-logic`)
                                filterData = multiselects(positives, negatives, conjunction, multiselectName, filterData)
                            }
                        }
                    }

                    params.filter(p => !usedParams.includes(p.name)).forEach(param => ui.notifications.warn(game.i18n.format("PTU.CompendiumBrowser.Enrichment.UnknownFilterSetting", {
                        filterName: param.name,
                        tabName: tabKey
                    })))

                    try {
                        await tab.open(filterData)
                    } catch (e) {
                        ui.notifications.error(game.i18n.format("PTU.CompendiumBrowser.Enrichment.LikelyMalformedExpressionBrowserCrashed"));
                        throw e;
                    }
                })
            })
        }

        // These Sheets should be interactive, such that clicking on the anchor actually does something
        // Due to some performance stutters during development, those are relatively restrictive.
        // It the anchor appears somehwere where it should also work, add an appropriate hook here
        Hooks.on("renderJournalTextPageSheet", (journal, $html) => {
            // maybe related to why this does do need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const journalHtmlElement = $html.filter(".journal-page-content").get(0);
            activateCompendiumEnricherListener(journalHtmlElement)

        });
        Hooks.on("renderChatMessageHTML", (message, html) => {
            // maybe related to why this does not need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const messageHtmlElement = html;
            activateCompendiumEnricherListener(messageHtmlElement)

            message.activateListeners($(html))
        });
        Hooks.on("renderPTUItemSheet", (itemSheet, $html) => {
            // maybe related to why this does not need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const itemHtmlElement = $html.get(0)
            activateCompendiumEnricherListener(itemHtmlElement)
        });
    }
}