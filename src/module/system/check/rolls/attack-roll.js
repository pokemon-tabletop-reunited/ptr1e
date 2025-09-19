import { CheckRoll } from "./roll.js";

export class AttackRoll extends CheckRoll {
    static CHAT_TEMPLATE = "systems/ptu/static/templates/chat/attack/attack-roll.hbs";

    /** @override */
    async render(options = {}) {
        if(!this._evaluated) await this.evaluate();
        const { isPrivate, flavor, template } = options;

        const attack = this.options.attack ?? options.attack ?? null;

        const actor = await (async () => {
            if(!attack) return null;
            const actor = await fromUuid(attack.actor);
            return actor;
        })();

        const item = await (async () => {
            if(!actor) return null;
            const modifier = actor.attacks.get(attack.id);
            if(!modifier) return null;

            return modifier.item;
        })();

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

        const tags = await (async () => {
            if(!item) return [];

            const tags = [];
            if(item.system.effect) tags.push({slug: "effect", label: game.i18n.localize("PTU.Tags.Effect"), value: item.system.effect });
            if(item.system.frequency) tags.push({slug: "frequency", label: game.i18n.localize("PTU.Tags.Frequency"), value: item.system.frequency });
            if(item.system.range) tags.push({slug: "range", label: game.i18n.localize("PTU.Tags.Range"), value: item.system.range });
            return tags;
        })();

        const chatData = {
            formula: isPrivate ? "???" : (this.options.modifierValue ? `${this.formula}${this.options.modifierValue > 0 ? '+' : ''}${this.options.modifierValue}` : this.formula),
            user: game.user.id,
            tooltip: isPrivate ? "" : await this.getTooltip(),
            total: isPrivate ? "?" : Math.round(this.total * 100) / 100,
            attack: this.options.attack ?? options.attack ?? null,
            item,
            canRollDamage: this.roller === game.user || game.user.isGM,
            self: actor,
            targets,
            outcome: isPrivate ? null : this.options.outcome ?? options.outcome ?? null,
            outcomes: isPrivate ? null : this.options.outcomes ?? options.outcomes ?? null,
            tags
        }

        const content = await foundry.applications.handlebars.renderTemplate(template ?? AttackRoll.CHAT_TEMPLATE, chatData);
        return foundry.applications.ux.TextEditor.implementation.enrichHTML(content, {async: true})
    }
}