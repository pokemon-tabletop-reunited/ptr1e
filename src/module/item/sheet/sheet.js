import { sluggify, sortStringRecord } from "../../../util/misc.js";
import { RuleElements } from "../../rules/index.js";
import { RULE_ELEMENT_FORMS, RuleElementForm } from "./rule-elements/index.js";

class PTUItemSheet extends foundry.appv1.sheets.ItemSheet {
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ptu", "sheet", "item"],
            width: 650,
            height: 510,
            tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "overview" }],
            dragDrop: [{ dragSelector: null, dropSelector: null }]
        });
    }

    /** @override */
    _canDragDrop(selector) {
        return this.isEditable;
    }

    /** @override */
    get template() {
        return `systems/ptu/static/templates/item/${this.object.type}-sheet.hbs`;
    }

    /** @override */
    async getData() {
        const data = super.getData();
        data.config = CONFIG.PTU.data;
        
        data.editLocked = data.editable == false ? true : this.object.getFlag('ptu', 'editLocked') ?? false;

        this.object._updateIcon({update: true});

        data.referenceEffect = this.item.referenceEffect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${foundry.utils.duplicate(this.item.referenceEffect)}]`, {async: true}) : null;
        data.itemEffect = this.item.system.effect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(foundry.utils.duplicate(this.item.system.effect), {async: true}) : this.item.system.effect;
        data.itemCost = await (async () => {
            const cost = parseInt(this.item.system.cost);
            if(!cost) return this.item.system.cost || "-";

            return foundry.applications.ux.TextEditor.implementation.enrichHTML(`@Poke[${this.item.uuid} noname]`, {async: true})
        })();

        const rules = this.item.toObject().system.rules ?? [];
        this.ruleElementForms = {};
        for(const [index, rule] of rules.entries()) {
            const FormClass = RULE_ELEMENT_FORMS[String(rule.key)] ?? RuleElementForm;
            this.ruleElementForms[Number(index)] = new FormClass({
                item: this.item,
                index,
                rule,
                object: this.item.rules.find(r => r.sourceIndex === index) ?? null
            });
        }

        data.rules = {
            labels: rules.map(rule => {
                const key = String(rule.key).replace(/^PTU\.RuleElement\./, "")
                const label = game.i18n.localize(`PTU.RuleElement.${key}`);
                const recognized = label !== `PTU.RuleElement.${key}`;
                return { label: recognized ? label : game.i18n.localize("PTU.RuleElement.Unrecognized"), recognized}
            }),
            selection: {
                selected: this.selectedRuleElementType,
                types: sortStringRecord(
                    Object.keys(RuleElements.all).reduce(
                        (result, key) => foundry.utils.mergeObject(result, {[key]: `RULES.Types.${key}`}),
                        {}
                    )
                )
            },
            elements: await Promise.all(
                rules.map(async (rule, index) => ({
                    template: await this.ruleElementForms[index].render(),
                    index,
                    rule
                }))
            )
        }

        if(this.item.flags.ptu?.showInTokenPanel === undefined) {
            if(this.item.type === "item" && this.item.roll) data.item.flags.ptu.showInTokenPanel = true;
            if (["move", "ability", "feat", "effect"].includes(this.item.type)) data.item.flags.ptu.showInTokenPanel = true;
        }
        
        return data;
    }

    async _onDrop(event) {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));

        if(data.type === "pokedollar" && this.item.type === "item") {
            const amount = parseInt(data.data.amount);
            if(!amount) return;

            this.object.update({"system.cost": amount});
        }

        if(data.type === "Item" && data.uuid) {
            const item = await fromUuid(data.uuid);
            if(!["effect", "condition".includes(item.type)]) return;

            this.object.update({"system.referenceEffect": item.uuid});
        }
    }

    /** @override */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();

		buttons.unshift({
			label: "Send to Chat",
			class: ".to-chat",
			icon: "fas fa-comment",
			onclick: () => this.object.sendToChat?.()
		});

        return buttons;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        html.find('select[data-action=select-rule-element]').on('change', (event) => {
            this.selectedRuleElementType = event.target.value;
        });

        html.find('select[data-target]').on('change', (event) => {
            event.preventDefault();
            const target = event.target.dataset.target;
            const value = event.target.value;
            this.item.update({[target]: value});
        });

        html.find('a.add-rule-element').click(async (event) => {
            await this._onSubmit(event);
            const rulesData = this.item.toObject().system.rules ?? [];
            const key = this.selectedRuleElementType ?? "ActiveEffectLike"
            this.item.update({"system.rules": rulesData.concat({key})});
        });

        html.find('a.remove-rule-element').click(async (event) => {
            await this._onSubmit(event);
            const rulesData = this.item.toObject().system.rules ?? [];
            const index = Number(event.currentTarget.dataset.ruleIndex ?? NaN);
            if(rulesData && Number.isInteger(index) && rulesData.length > index) {
                rulesData.splice(index, 1);
                this.item.update({"system.rules": rulesData});
            }
        });

        const rulesSections = html.find(".rules .rule-body");
        for(const ruleSection of rulesSections) {
            const idx = ruleSection.dataset.idx ? Number(ruleSection.dataset.idx) : NaN;
            const form = this.ruleElementForms[idx];
            if(form) {
                form.activateListeners(ruleSection);
            }
        }

        html.find('a[data-clipboard]').click((event) => {
            const clipText = event.currentTarget.dataset.clipboard;
            if(clipText) {
                game.clipboard.copyPlainText(clipText);
                ui.notifications.info(game.i18n.format("PTU.ClipboardNotification", {clipText}));
            }
        })

        const slugInput = html.find("input[name='system.slug']")[0];
        if(slugInput) {
            slugInput.addEventListener("change", () => {
                slugInput.value = sluggify(slugInput.value);
            });
            html.find("a[data-action='regenerate-slug']").click(() => {
                if(this._submitting) return;

                slugInput.value = sluggify(this.item.name);
                const event = new Event("change");
                slugInput.dispatchEvent(event);
            });
            if(!slugInput.value) {
                slugInput.value = sluggify(this.item.name);
                const event = new Event("change");
                slugInput.dispatchEvent(event);
            }
        }
    }

    /** 
     * @override 
     * Tagify sets an empty input field to "" instead of "[]", which later causes the JSON parse to throw an error
    */
    async _onSubmit(event, {updateData = null, preventClose = false, preventRender = false} = {}) {
        const $form = $(this.form);
        $form.find("tags ~ input").each((_i, input) => {
            if (input.value === "") input.value = "[]";
        });

        return super._onSubmit(event, { updateData, preventClose, preventRender });
    }

    /** @override */
    async _updateObject(event, formData) {
        const expanded = foundry.utils.expandObject(formData);

        if(Array.isArray(expanded.system.prerequisites)) {
            expanded.system.prerequisites = expanded.system.prerequisites.map(s => s.value).filter(s => !!s)
        }
        if(Array.isArray(expanded.system.keywords)) {
            expanded.system.keywords = expanded.system.keywords.map(s => s.value).filter(s => !!s)
        }

        if(expanded.system?.rules) {
            const rules = this.item.toObject().system.rules ?? [];

            for(const [key, value] of Object.entries(expanded.system.rules)) {
                const idx = Number(key);

                if(RuleElements.all[rules[idx].key] === undefined) {
                    ui.notifications.error(game.i18n.format("PTU.RuleParseUnknownRule", {key: rules[idx].key}));
                    console.warn("PTU | Rule parse error", "Unknown rule", rules[idx].key);
                    throw new Error("Unknown rule"); // prevent update, to give the user a chance to correct, and prevent bad data
                }

                if(typeof value === "string") {
                    try {
                        rules[idx] = JSON.parse(value);
                    }
                    catch (error) {
                        ui.notifications.error(game.i18n.format("PTU.RuleParseSyntaxError", {message: error?.message}));
                        console.warn("PTU | Rule parse error", error?.message, value);
                        throw error; // prevent update, to give the user a chance to correct, and prevent bad data
                    }
                    continue;
                }

                if(!value) continue;

                rules[idx] = foundry.utils.mergeObject(rules[idx] ?? {}, value);

                // Call specific subhandlers
                this.ruleElementForms[idx]?._updateObject(rules[idx])

                const predicate = rules[idx].predicate;
                if(typeof predicate === "string" && predicate.trim() === "") {
                    delete rules[idx].predicate;
                }
                else if(typeof predicate === "string") {
                    try {
                        rules[idx].predicate = JSON.parse(predicate);
                    } catch (error) {
                        ui.notifications.error(
                            game.i18n.format("PTU.RuleParseSyntaxError", { message: error.message })
                        );
                        console.warn("PTU | Rule parse error", error?.message, predicate);
                        throw error; // prevent update, to give the user a chance to correct, and prevent bad data
                    }
                }
            }

            expanded.system.rules = rules;
        }

        return super._updateObject(event, foundry.utils.flattenObject(expanded));
    }
}

export { PTUItemSheet }