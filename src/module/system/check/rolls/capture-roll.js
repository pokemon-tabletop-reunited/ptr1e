import { CheckRoll } from "./roll.js";

class CaptureRoll extends CheckRoll {
    /** @override */
    constructor(formula, data, options) {
        // Let the base CheckRoll class handle the formula and modifiers
        super(formula, data, options);
    }

    /** @override */
    get template() {
        return "systems/ptu/static/templates/chat/check/capture-roll.hbs";
    }

    /** @override */
    async render(options = {}) {
        if(!this._evaluated) await this.evaluate();
        const { isPrivate, flavor, template } = options;

        const actor = this.options?.origin?.actor ? await fromUuid(this.options.origin.actor) : null;
        const item = this.options?.origin?.item ? await fromUuid(this.options.origin.item) : null;

        const targets = await (async () => {
            const data = this.options.targets ?? options.targets ?? [];
            if(!data?.length > 0) return [];

            const targets = [];
            for(const target of data) {
                if(typeof target?.actor === "object") {
                    const actor = game.actors.get(target.actor._id) ?? null;
                    targets.push({...(target.actor.toObject?.() ?? target.actor), dc: target.dc, isPrivate: actor?.isPrivate});
                    continue;
                }
                const actor = await fromUuid(target.actor ?? "");
                if(!actor) continue;
                targets.push({...(actor.toObject?.() ?? actor), uuid: target.actor, dc: target.dc, isPrivate: actor.isPrivate});
            }
            return targets;
        })();

        const chatData = {
            formula: isPrivate ? "???" : (this.options.modifierValue ? `${this.formula}${this.options.modifierValue > 0 ? '+' : ''}${this.options.modifierValue}` : this.formula),
            user: game.user.id,
            tooltip: isPrivate ? "" : await this.getTooltip(),
            total: isPrivate ? "?" : Math.round(this.total * 100) / 100,
            item,
            self: actor,
            targets,
            outcome: isPrivate ? null : this.options.outcome ?? options.outcome ?? null,
            outcomes: isPrivate ? null : this.options.outcomes ?? options.outcomes ?? null,
            captureModifier: this.options.captureModifier,
            ...options
        }

        return foundry.applications.handlebars.renderTemplate(template ?? this.template, chatData);
    }
}

export { CaptureRoll }