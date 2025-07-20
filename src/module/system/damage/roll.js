/** @typedef {import('../../actor').PTUActor} PTUActor */

class DamageRoll extends foundry.dice.Roll {
    /**
     * @param {string} formula
     * @param {PTUActor} actor
     */
    static prepareFromAdvancedFormula(formula, actor, data = {}, options = {}) {
        const withTicks = formula.replaceAll(/td/gm, "@actor.system.health.tick");
        return () => new DamageRoll(withTicks, data, options);
    }

    constructor(formula, data = {}, options = {}) {
        options.isReroll ??= false
        super(formula, data, options);

        this.isReroll = options.isReroll;
        this.isRerollable =
            !this.isReroll && this.dice.some((d) => d.modifiers.includes("kh") || d.modifiers.includes("kl"));
        this.roller = game.users.get(this.options.rollerId ?? "") ?? null;
    }

    get critImmuneTotal() {
        return this.options?.crit?.nonCritValue ?? this.total ?? null
    }

    static CHAT_TEMPLATE = "systems/ptu/static/templates/chat/attack/damage-roll.hbs";

    /** @override */
    async render(options = {}) {
        if (!this._evaluated) await this.evaluate();
        const { isPrivate, template } = options;

        const attack = this.options.attack ?? options.attack ?? null;

        const actor = await (async () => {
            if (!attack) return null;
            const actor = await fromUuid(attack.actor);
            return actor;
        })();

        const item = await (async () => {
            if (!actor) return null;
            const modifier = actor.attacks.get(attack.id);
            if (!modifier) return null;

            return modifier.item;
        })();

        const targets = await (async () => {
            const data = this.options.targets ?? options.targets ?? [];
            if (!data?.length > 0) return [];

            const targets = [];
            for (const target of data) {
                if (typeof target?.actor === "object") {
                    const actor = game.actors.get(target.actor._id) ?? null;
                    targets.push({...(target.actor.toObject?.() ?? target.actor), dc: target.dc, isPrivate: actor?.isPrivate});
                    continue;
                }
                const actor = await fromUuid(target.actor ?? "");
                if (!actor) continue;
                targets.push({ ...(actor.toObject?.() ?? actor), dc: target.dc, isPrivate: actor.isPrivate });
            }
            return targets;
        })();

        const tags = await (async () => {
            if (!item) return [];

            const tags = [];
            return tags;
        })();

        const chatData = {
            formula: isPrivate ? "???" : this.formula,
            user: game.user.id,
            tooltip: isPrivate ? "" : await this.getTooltip(),
            total: isPrivate ? "?" : Math.round(this.total * 100) / 100,
            attack: this.options.attack ?? options.attack ?? null,
            item,
            canRollDamage: this.roller === game.user || game.user.isGM,
            self: actor,
            targets,
            outcome: this.options.outcome ?? options.outcome ?? null,
            tags,
            crit: this.options.crit ?? options.crit ?? false,
            persistenceFormula: this.options.persistenceFormula ?? options.persistenceFormula ?? null,
            fiveStrike: this.options.fiveStrikeAmount ?? options.fiveStrikeAmount ?? null,
        }

        if (chatData.crit.show === false && game.settings.get("ptu", "metagame.alwaysShowCrits") === true) {
            chatData.crit.show = true;
        }

        return foundry.applications.handlebars.renderTemplate(template ?? DamageRoll.CHAT_TEMPLATE, chatData);
    }

    /** @override */
    async toMessage(messageData = {}, options = {}) {
        if (options.create === undefined) options.create = true;
        const message = await super.toMessage(messageData, { ...options, create: false });
        message.rolls = [this, options.critRoll].filter(r => r);
        message.classType = "damage";
        return options.create ? await CONFIG.ChatMessage.documentClass.create(message) : message;
    }

    /** @override */
    async _evaluate({ minimize = false, maximize = false } = {}) {

        // Step 1 - Replace intermediate terms with evaluated numbers
        const intermediate = [];
        for (let term of this.terms) {
            if (!(term instanceof foundry.dice.terms.RollTerm)) {
                throw new Error("Roll evaluation encountered an invalid term which was not a RollTerm instance");
            }
            if (term.isIntermediate) {
                await term.evaluate({ minimize, maximize });
                this._dice = this._dice.concat(term.dice);
                term = new foundry.dice.terms.NumericTerm({ number: term.total, options: term.options });
            }
            intermediate.push(term);
        }
        this.terms = intermediate;

        // Step 2 - Simplify remaining terms
        this.terms = this.constructor.simplifyTerms(this.terms);

        const fudges = this.options.fudges ?? [];
        if (fudges) {
            for (const term of this.terms.filter(t => t instanceof foundry.dice.terms.DiceTerm)) {
                const fudge = `${term.number}d${term.faces}`;
                if (fudges[fudge]?.length > 0) {
                    term._evaluated = true;
                    term.results = fudges[fudge];
                    term._evaluateModifiers();
                    break;
                }
            }
        }

        // Step 3 - Evaluate remaining terms
        for (let term of this.terms) {
            if (!term._evaluated) await term.evaluate({ minimize, maximize });
        }

        // Step 4 - Evaluate the final expression
        this._total = this._evaluateTotal();
        return this;
    }
}

export { DamageRoll }