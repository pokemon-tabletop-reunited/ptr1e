/**
 * @typedef {Object} RuleElementFormOptions
 * @property {PTUItem} item
 * @property {number} index
 * @property {RuleElementPTU} rule
 * @property {RuleElementPTU | null} object
 */

class RuleElementForm {
    get template() {
        return "systems/ptu/static/templates/item/rules/default.hbs";
    }

    /** @param {RuleElementFormOptions} options */
    constructor(options) {
        this.item = options.item;
        this.index = options.index;
        this.rule = options.rule;
        this.object = options.object;
    }

    async getData() {
        return {
            rule: this.rule,
            object: this.object,
            index: this.index,
            item: this.item
        };
    }

    async render() {
        const data = await this.getData();
        return foundry.applications.handlebars.renderTemplate(this.template, data);
    }

    updateItem(updates) {
        const rules = this.item.toObject().system.rules;
        rules[this.index] = foundry.utils.mergeObject(this.rule, updates, { performDeletions: true });
        this.item.update({ [`system.rules`]: rules });
    }

    activateListeners(_html) { }
    _updateObject(_formData) { }

    coerceNumber(value) {
        if (value !== "" && !isNaN(Number(value))) {
            return Number(value);
        }
    
        return value;
    }
}

export { RuleElementForm }