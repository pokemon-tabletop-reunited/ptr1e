import { typeEffectiveness } from "../../../scripts/config/data/effectiveness.js";
import { PTUSettingsMenu } from "./base.js";

const TypeSettingsConfig = {
    "typeEffectiveness": {
        name: "PTU.Settings.Type.TypeEffectiveness.Name",
        hint: "PTU.Settings.Type.TypeEffectiveness.Hint",
        type: Object,
        default: typeEffectiveness
    },
}

export class TypeSettings extends PTUSettingsMenu {
    static namespace = "type";

    static get settings() {
        return TypeSettingsConfig
    }

    static get SETTINGS() {
        return Object.keys(TypeSettingsConfig);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 820,
            height: 920,
            template: "systems/ptu/static/templates/config/settings/types.hbs",
            resizable: true
        })
    }

    async getData() {
        const data = await super.getData();

        if (this.cache["types"] === undefined) {
            const types = game.settings.get("ptu", "type.typeEffectiveness") || this.constructor.settings.typeEffectiveness.default;
            this.cache["types"] = types;
        }

        const typeEffectiveness = foundry.utils.duplicate(this.cache["types"]);
        delete typeEffectiveness.Untyped;

        let typeLength = Object.keys(typeEffectiveness).length + 1;
        if(!game.settings.get("ptu", "homebrew.nuclearType") && typeEffectiveness["Nuclear"]) typeLength--;
        if(!game.settings.get("ptu", "homebrew.shadowType") && typeEffectiveness["Shadow"]) typeLength--;

        return {
            ...data,
            typeEffectiveness,
            types: Object.keys(this.cache["types"].Untyped.effectiveness),
            typeLength
        }
    }

    activateListeners($html) {
        super.activateListeners($html);

        $html.find(".type").on("mouseover", event => {
            const { offensive, defensive } = event.currentTarget.dataset;
            if (!offensive || !defensive) return;

            $html.find(`.type[data-offensive="${offensive}"]`).addClass("highlight-x");
            $html.find(`.type[data-defensive="${defensive}"]`).addClass("highlight-y");
        });

        $html.find(".type").on("mouseout", event => {
            const { offensive, defensive } = event.currentTarget.dataset;
            if (!offensive || !defensive) return;

            $html.find(`.type[data-offensive="${offensive}"]`).removeClass("highlight-x");
            $html.find(`.type[data-defensive="${defensive}"]`).removeClass("highlight-y");
        });

        $html.find(".type").on("click", event => {
            event.preventDefault();
            const { offensive, defensive } = event.currentTarget.dataset;
            if (!offensive || !defensive) return;

            const types = foundry.utils.duplicate(this.cache["types"]);
            const newValue = (() => {
                switch (types[defensive].effectiveness[offensive]) {
                    case 0:
                        return 0.5;
                    case 0.5:
                        return 1;
                    case 1:
                        return 2;
                    case 2:
                        return 2;
                }
            })();
            if(newValue !== types[defensive].effectiveness[offensive]) {
                types[defensive].effectiveness[offensive] = newValue;
                this.cache["types"] = types;
                this.render(true);
            }
        });

        $html.find(".type").on("contextmenu", async event => {
            event.preventDefault();
            const { offensive, defensive } = event.currentTarget.dataset;
            if (!offensive || !defensive) return;

            const types = foundry.utils.duplicate(this.cache["types"]);
            const newValue = (() => {
                switch (types[defensive].effectiveness[offensive]) {
                    case 0: 
                        return 0;
                    case 0.5:
                        return 0;
                    case 1:
                        return 0.5;
                    case 2:
                        return 1;
                }
            })();
            if(newValue !== types[defensive].effectiveness[offensive]) {
                types[defensive].effectiveness[offensive] = newValue;
                this.cache["types"] = types;
                this.render(true);
            }
        });

        $html.find("button[type='add']").on("click", async event => {
            event.preventDefault();

            const d = await this.createTypeDialog();
            d.render(true);
        });

        $html.find(".type[data-type]").on("dblclick", async event => {
            event.preventDefault();

            const type = event.currentTarget.dataset.type;
            const typeData = this.cache["types"][type];
            const d = await this.createTypeDialog({
                barImg: typeData.images.bar,
                iconImg: typeData.images.icon,
                name: type
            }, true);
            d.render(true);
        });
    }

    async _onReset(event) {
        event.preventDefault();
        Dialog.confirm({
            title: game.i18n.localize("PTU.Settings.Type.Reset.Title"),
            content: game.i18n.localize("PTU.Settings.Type.Reset.Content"),
            yes: () => {
                this.cache["types"] = this.constructor.settings.typeEffectiveness.default;
                this.render(true);
            }
        })
    }

    async _updateObject(event, data) {
        if (event.type === "submit") {
            const current = game.settings.get("ptu", "type.typeEffectiveness");
            if(!objectsEqual(current, this.cache["types"])) {
                await game.settings.set("ptu", "type.typeEffectiveness", this.cache["types"]);
                SettingsConfig.reloadConfirm({world: true});
            }
        }

        if (event.type === "submit") {
            this.close();
        } else {
            this.render();
        }
    }

    async createTypeDialog(typeData, exists = false) {
        if (typeData?.name === "Untyped") return;
        const buttons = {
            submit: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("PTU.Settings.Type.Submit"),
                callback: ($html, event) => {
                    const formData = $html.find("input").map((_, input) => ({ name: input.name, value: input.value })).get().reduce((obj, { name, value }) => {
                        obj[name] = value;
                        return obj;
                    }, {});

                    const types = foundry.utils.duplicate(this.cache["types"]);
                    if (exists) {
                        types[typeData.name].images = {
                            bar: formData.barImg,
                            icon: formData.iconImg
                        };
                    }
                    else {
                        types[formData.name.titleCase()] = {
                            images: {
                                bar: formData.barImg,
                                icon: formData.iconImg
                            },
                            effectiveness: foundry.utils.duplicate(types.Untyped.effectiveness)
                        };
                        for (const type of Object.keys(types)) {
                            types[type].effectiveness[formData.name.titleCase()] = 1;
                        }
                        const Untyped = foundry.utils.duplicate(types.Untyped);
                        delete types.Untyped;
                        types.Untyped = Untyped;
                    }
                    if (!objectsEqual(this.cache["types"], types)) {
                        this.cache["types"] = types;
                    }
                    this.render(true);
                }
            }
        }
        if (exists && this.constructor.settings.typeEffectiveness.default[typeData.name] === undefined) {
            buttons.delete = {
                icon: '<i class="fas fa-trash"></i>',
                label: game.i18n.localize("PTU.Settings.Type.Delete.Label"),
                callback: ($html, event) =>
                    Dialog.confirm({
                        title: game.i18n.localize("PTU.Settings.Type.Delete.Title"),
                        content: game.i18n.localize("PTU.Settings.Type.Delete.Content"),
                        yes: () => {
                            const types = foundry.utils.duplicate(this.cache["types"]);
                            delete types[typeData.name];
                            for (const type of Object.keys(types)) {
                                delete types[type].effectiveness[typeData.name];
                            }
                            if (!objectsEqual(this.cache["types"], types)) {
                                this.cache["types"] = types;
                            }
                            this.render(true);
                        },
                        defaultYes: false
                    })
            }
        }
        buttons.cancel = {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("DIALOG.DeleteItem.Cancel")
        }
        return new Dialog({
            title: exists ? game.i18n.localize("PTU.Settings.AddType.ExistsLabel") : game.i18n.localize("PTU.Settings.AddType.Label"),
            content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/config/settings/add-type.hbs", { ...typeData, exists }),
            buttons,
            render: html => {
                const buttons = $(html).find("button.file-picker");
                for (const button of buttons) {
                    const filePicker = FilePicker.fromButton(button)
                    button.addEventListener("click", event => filePicker.render(true));
                }
            },
            default: "cancel",
        });
    }
}