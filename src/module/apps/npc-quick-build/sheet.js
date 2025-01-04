import { NpcQuickBuildData } from "./document.js";
// import {tagify} from "../../../util/tags.js";

export class PTUNpcQuickBuild extends FormApplication {
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ptu", "pokemon", "npc-quick-build"],
            template: "systems/ptu/static/templates/apps/npc-quick-build-sheet.hbs",
            width: 660,
            height: "auto",
            title: "NPC Quick Build",
            submitOnChange: true,
            submitOnClose: true,
            closeOnSubmit: false,
            dragDrop: [{ dragSelector: undefined, dropSelector: undefined }]
        });
    }

    constructor(options) {
        super(options);

        this.data = new NpcQuickBuildData();
    }

    /** @override */
    getData() {
        const data = super.getData();

        const allianceOptions = {
            party: "PTU.Alliance.Party",
            opposition: "PTU.Alliance.Opposition",
            neutral: "PTU.Alliance.Neutral"
        };


        return {
            ...data,
            config: CONFIG.PTU.data,
            allianceOptions,
            data: this.data,
        }
    }

    /** @override */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        const sheet = this;

        // Add notes button
        buttons.unshift({
            label: "Randomize",
            class: "randomize",
            icon: "fas fa-dice",
            onclick: () => sheet.loading().then(()=>sheet.data.randomizeAll()).then(()=>sheet.renderAsync()).then(()=>this.disabled = false),
        })

        return buttons;
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        const globalThis = this;

        // next/prev page listeners
        $html.find('.page').on('click', function (event) {
            event.preventDefault();
            if (event.target.disabled) return;
            event.target.disabled = true;
            globalThis.data.page = parseInt(event?.target?.dataset?.page ?? globalThis.data.page);
            globalThis.render(true);
        });
        $html.find('.next-page').on('click', (event) => {
            event.preventDefault();
            if (event.target.disabled) return;
            event.target.disabled = true;
            globalThis.data.page = parseInt($html.get(0)?.dataset?.page || "0") + 1;
            globalThis.render(true);
        });

        $html.find('.button-set[data-path][data-value][data-dtype="Number"]').on('click', function (event) {
            event.preventDefault();
            // if (event.target.disabled) return;
            // event.target.disabled = true;
            const dataset = this?.dataset;
            globalThis.data.setProperty(dataset?.path, parseInt(dataset?.value));
            globalThis.render(true);

        });

        for (const multiselect of $html.find('.ptu-tagify[data-filter-name]')) {
            // await tagify(element);
            const data = this.data.multiselects[multiselect.dataset.filterName];
            const savePath = multiselect.name;
            const tagifyOptions = {
                enforceWhitelist: true,
                keepInvalidTags: false,
                editTags: false,
                tagTextProp: "label",
                dropdown: {
                    enabled: 0,
                    fuzzySearch: true,
                    mapValueTo: "label",
                    maxItems: data.options.length,
                    searchKeys: ["label"],
                },
                whitelist: data.options,
                maxTags: data.maxTags,
            };

            if (multiselect.matches(".trainer-sex")) {
                tagifyOptions.enforceWhitelist = false;
            }

            if (multiselect.matches(".trainer-features")) {
                tagifyOptions.templates ??= {};
                tagifyOptions.templates.dropdownItem = function(tagData) {
                    return `<div label="${tagData.label}" value="${tagData.value}" uuid="${tagData.uuid}" mappedvalue="${tagData.mappedValue}" class="tagify__dropdown__item ${tagData.label} ${tagData.crossClass ? "crossclass" : ""}" tabindex="0" role="option">${tagData.label}</div>`
                };
            }

            const tagify = new Tagify(multiselect, tagifyOptions);

            // // Add the name to the tags html as an indicator for refreshing
            // if (multiselect.name) {
            //     tagify.DOM.scope.dataset.name = multiselect.name;
            // }

            // tagify.on("click", (event) => {
            //     const target = event.detail.event.target;
            //     if (!target) return;

            //     const value = event.detail.data.value;
            //     const selected = data.selected.find((s) => s.value === value);
            //     if (selected) {
            //         const current = !!selected.not;
            //         selected.not = !current;
            //         this.render();
            //     }
            // });
            tagify.on("change", (event) => {
                event.preventDefault();

                const selections = JSON.parse(event.detail.value || "[]");
                const isValid =
                    Array.isArray(selections) &&
                    selections.every((s) => typeof s === "object" && typeof s["value"] === "string");

                if (isValid && savePath) {
                    this.data.setProperty(savePath, selections);
                    this.render();
                }
            });
        }

        // "trainer image" button
        $html.find('img[data-edit]').on('click', async function (event) {
            event.preventDefault();
            const attr = event.currentTarget.dataset.edit;
            const current = foundry.utils.getProperty(globalThis.data, attr);
            const fp = new FilePicker({
                current,
                type: "image",
                redirectToRoot: current ? [current] : [],
                callback: path => {
                    globalThis.data.setProperty(attr, path);
                    globalThis.render(true);
                    console.log(globalThis.data, attr, path);
                },
                top: globalThis?.position?.top + 40,
                left: globalThis?.position?.left + 10
            });
            return fp.browse();
        });

        // "remove pokemon" button
        $html.find('.pokemon-remove').on('click', function (event) {
            event.preventDefault();
            const dataset = this.closest(".party-pokemon")?.dataset;
            globalThis.data.resetPokemonSlot(dataset?.slot);
            globalThis.render(true);
        });

        // "randomize pokemon" button
        $html.find('.pokemon-randomize').on('click', async function (event) {
            event.preventDefault();
            const dataset = this.closest(".party-pokemon")?.dataset;
            await globalThis.loading();
            await globalThis.data.randomizePartyPokemon(dataset?.slot);
            globalThis.render(true);
        });

        $html.find("#sourceSelect").on("change", function (event) {
            event.preventDefault();
            globalThis.data.sourceSelect.value = this?.value;
            globalThis.data.sourceSelect.updated = true;

            globalThis.render(true);
        });

        $html.find("input.submit[type='button']").on("click", (event) => {
            event.preventDefault();
            if (this.data.ready) {
                this.loading().then(()=>this.close({ properClose: true }));
            }
        });
    }

    async preload() {
        return this.data.preload();
    }


    /** 
     * @override 
     * Tagify sets an empty input field to "" instead of "[]", which later causes the JSON parse to throw an error
    */
    async _onSubmit(event, {updateData = null, preventClose = false, preventRender = false} = {}) {
        const $form = $(this.form);
        $form.find("tags ~ input[data-dtype='JSON']").each((_i, input) => {
            if (input.value === "") input.value = "[]";
        });

        return super._onSubmit(event, { updateData, preventClose, preventRender });
    }


    /** @override */
    async _updateObject(event, formData) {
        event.preventDefault();
        for (const [key, value] of Object.entries(formData)) {
            if (!key || value == undefined) continue;
            this.data.setProperty(key, value);
        }

        return this.render(true);
    }

    async _onDrop(event) {
        // const data = JSON.parse(event.dataTransfer.getData('text/plain'));

        // if (data.type == "Item") {
        //     const item = await fromUuid(data.uuid);
        //     if (item.type != "species") return;

        //     this.data.speciesField.value = data.uuid;
        //     this.data.speciesField.updated = true;
        // }
        // else if (data.type == "RollTable") {
        //     this.data.tableSelect.value = data.uuid
        //     this.data.tableSelect.updated = true;
        // }
        // else if (data.type == "Folder") {
        //     this.data.folderField.value = data.uuid;
        //     this.data.folderField.updated = true;
        // }

        return this.render(true);
    }

    async loading() {
        // hide the header buttons
        const root = this._element?.get(0);
        const headerButtons = root?.getElementsByClassName("header-button");
        if (headerButtons) Array.prototype.forEach.call(headerButtons, btn=>btn.hidden = true);

        const form = root?.getElementsByTagName("form")?.[0];
        if (form) {
            const loadingScreen = document.createElement("div");
            loadingScreen.classList.add("loading");
            const loadingWheel = document.createElement("div");
            loadingWheel.classList.add("load-wheel");
            loadingScreen.appendChild(loadingWheel);
            loadingScreen.style["min-width"] = `${form.offsetWidth}px`;
            loadingScreen.style["min-height"] = `${form.offsetHeight}px`;

            form.replaceWith(loadingScreen);
        }
    }

    async unloading() {
        // unhide the header buttons
        const root = this._element?.get(0);
        const headerButtons = root?.getElementsByClassName("header-button");
        if (headerButtons) Array.prototype.forEach.call(headerButtons, btn=>btn.hidden = false);
    }

    async renderAsync(force = false, options = {}) {
        const localthis = this;
        await this.data.refresh().then(() => localthis._render(force, options)).catch(err => {
            this._state = Application.RENDER_STATES.ERROR;
            Hooks.onError("Application#render", err, {
                msg: `An error occurred while rendering ${this.constructor.name} ${this.appId}`,
                log: "error",
                ...options
            });
            return this.unloading();
        });
        await this.unloading();
        return this;
    }

    /** @override */
    render(force = false, options = {}) {
        this.renderAsync(force, options);
        return this;
    }

    /** @override */
    // async _renderInner(data) {
    //     const $html = await super._renderInner(data);
    //     return $html;
    // }

    /** @override */
    async close(options) {
        if (options?.properClose) {
            await this.data.finalize().then(()=>this.data.generate()).catch(err => {
                ui.notifications.error("Could not generate the NPC! Check the dev console for more details.");
                Hooks.onError("Application#close", err, {
                    msg: `An error occurred while closing ${this.constructor.name} ${this.appId}`,
                    log: "error",
                    ...options
                });
                return this.unloading();
            });;
        }

        return super.close({ ...options, force: true });
    }

}