import { sluggify } from "../../../util/misc.js";
import { PTUModifier, StatisticModifier } from "../../actor/modifiers.js";
import { PTUMove } from "../../item/index.js";
import { DamageRoll } from "../damage/roll.js";
import { PTUDiceCheck, eventToRollParams } from "./check.js";
import { CheckDialog } from "./dialogs/dialog.js";

class PTUDamageCheck extends PTUDiceCheck {

    constructor({ source, targets, selectors, event, outcomes, accuracyRollResult }) {
        super({ source, targets, selectors, event });

        this.outcomes = outcomes;
        this.accuracyRollResult = accuracyRollResult;
    }

    get isSelfAttack() {
        return this._isSelfAttack ??= this.selectors.includes("self-damage");
    }
    get isRangedAttack() {
        return this._isRangedAttack ??= this.selectors.includes("ranged-damage");
    }

    get isFiveStrike() {
        return this.item?.isFiveStrike ?? false;
    }

    /**
     * @type {PTUMove}
     */
    get item() {
        return this._source.item;
    }

    get rollCls() {
        return DamageRoll;
    }

    /* -------------------------------------------- */
    /* Preperation                                  */
    /* -------------------------------------------- */

    /** @override */
    async prepareContexts(attackStatistic = null) {
        if (this.isSelfAttack) {
            const context = await this.actor.getContext({
                selfToken: this.token,
                targetToken: this.token,
                selfItem: this.item,
                domains: this.context.domains,
                statistic: attackStatistic
            });
            this._contexts = new Collection([[context.actor.uuid, context]]);
        }
        else await super.prepareContexts(attackStatistic);
    }

    /**
     * @override
     * @returns {PTUDamageCheck}
     */
    prepareModifiers() {
        const damageBaseModifiers = [
            new PTUModifier({
                slug: "damage-base",
                label: "Damage Base",
                modifier: this.item.damageBase.preStab,
            })
        ]
        if (this.item.damageBase.isStab) {
            damageBaseModifiers.push(
                new PTUModifier({
                    slug: "stab",
                    label: "STAB",
                    modifier: this.item.damageBase.postStab - this.item.damageBase.preStab,
                })
            )
        }

        const modifiers = []
        const diceModifiers = []

        const damageBonus = isNaN(Number(this.item.system.damageBonus)) ? 0 : Number(this.item.system.damageBonus);
        if (damageBonus != 0) {
            modifiers.push(new PTUModifier({
                slug: "damage-bonus",
                label: "Sheet Damage Bonus",
                modifier: damageBonus,
            }));
        }

        const option = this.targetOptions.find(o => o.startsWith("item:overwrite:attack"));
        if (option) {
            const stat = option.replace(/(item:overwrite:attack:)/, "");
            const value = this.actor.system.stats[stat]?.total ?? 0;
            modifiers.push(new PTUModifier({
                slug: "attack-overwrite",
                label: `Attack Overwrite (${stat})`,
                modifier: value,
            }));
        }
        else {
            if (this.selectors.includes("physical-damage")) {
                modifiers.push(new PTUModifier({
                    slug: "physical-damage",
                    label: "Attack Stat",
                    modifier: this.actor.system.stats.atk.total,
                }));
                if (this.actor.system.modifiers.damageBonus.physical?.total != 0) {
                    modifiers.push(new PTUModifier({
                        slug: "physical-damage-bonus",
                        label: "Attack Stat",
                        modifier: this.actor.system.modifiers.damageBonus.physical.total,
                    }));
                }
            }
            if (this.selectors.includes("special-damage")) {
                modifiers.push(new PTUModifier({
                    slug: "special-damage",
                    label: "Attack Stat",
                    modifier: this.actor.system.stats.spatk.total,
                }));
                if (this.actor.system.modifiers.damageBonus.special?.total != 0) {
                    modifiers.push(new PTUModifier({
                        slug: "special-damage-bonus",
                        label: "Attack Stat",
                        modifier: this.actor.system.modifiers.damageBonus.special.total,
                    }));
                }
            }
        }

        modifiers.push(
            ...extractModifiers(this.actor.synthetics, this.selectors, { injectables: { move: this.item, item: this.item, actor: this.actor }, test: this.targetOptions })
        )
        damageBaseModifiers.push(
            ...extractModifiers(this.actor.synthetics, [
                "damage-base",
                `${this.item.id}-damage-base`,
                `${this.item.slug}-damage-base`,
                `${sluggify(this.item.system.category)}-damage-base`,
                `${sluggify(this.item.system.type)}-damage-base`,
                `${sluggify(this.item.system.frequency)}-damage-base`
            ], { injectables: { move: this.item, item: this.item, actor: this.actor }, test: this.targetOptions })
        )
        diceModifiers.push(
            ...extractModifiers(this.actor.synthetics, [
                "damage-dice",
                `${this.item.id}-damage-dice`,
                `${this.item.slug}-damage-dice`,
                `${sluggify(this.item.system.category)}-damage-dice`,
                `${sluggify(this.item.system.type)}-damage-dice`,
                `${sluggify(this.item.system.frequency)}-damage-dice`
            ], { injectables: { move: this.item, item: this.item, actor: this.actor }, test: this.targetOptions })
        )

        this.modifiers = modifiers;
        this.damageBaseModifiers = damageBaseModifiers;
        this.diceModifiers = diceModifiers;

        return this;
    }

    /**
     * @override
     * @returns {PTUDamageCheck}
     */
    prepareStatistic() {
        super.prepareStatistic(sluggify(game.i18n.format("PTU.Action.DamageRoll", { move: this.item.name })));

        this.damageBase = Math.max(
            Object.values(this.damageBaseModifiers.reduce((a, b) => {
                if (!b.ignored && !a[b.slug]) a[b.slug] = b.modifier;
                return a;
            }, {})).reduce((a, b) => a + b, 0),
            1
        );
        this.targetOptions.add(`damage-base:${this.damageBase}`)

        return this;
    }

    /* -------------------------------------------- */
    /* Execution                                    */
    /* -------------------------------------------- */

    /**
     * @param {Object} context
     * @param {boolean} context.isReroll
     * @param {string} context.title
     * @param {CheckCallback} callback
     * @returns 
     */
    async execute(context = { isReroll: false, title, type: "damage" }, callback) {
        const { isReroll, title, type } = context;
        const dice = await (async () => {
            if (this.isFiveStrike) {
                const baseDamageBase = this.item.damageBase.preStab;
                if (baseDamageBase == 0) return null;

                const otherModifiers = this.damageBaseModifiers.filter(m => m.slug != "damage-base");

                const newBaseDb = await (async () => {
                    const fiveStrikeRoll = await new Roll("1d8").evaluate();
                    switch (fiveStrikeRoll.total) {
                        case 1: {
                            this.fiveStrikeResult = 1;
                            return baseDamageBase;
                        }
                        case 2:
                        case 3: {
                            this.fiveStrikeResult = 2;
                            return baseDamageBase * 2;
                        }
                        case 4:
                        case 5:
                        case 6: {
                            this.fiveStrikeResult = 3;
                            return baseDamageBase * 3;
                        }
                        case 7: {
                            this.fiveStrikeResult = 4;
                            return baseDamageBase * 4;
                        }
                        case 8: {
                            this.fiveStrikeResult = 5;
                            return baseDamageBase * 5;
                        }
                    }
                })();

                this.damageBase = Object.values(
                    [
                        new PTUModifier({
                            slug: "damage-base",
                            label: "Damage Base",
                            modifier: newBaseDb,
                        }),
                        ...otherModifiers
                    ].reduce(
                        (a, b) => {
                            if (!b.ignored && !a[b.slug]) a[b.slug] = b.modifier;
                            return a;
                        }, {}
                    )
                ).reduce((a, b) => a + b, 0);
            }

            const db = CONFIG.PTU.data.dbData[this.damageBase];
            if (!db) return null;
            return db;
        })();
        if (!dice) {
            ui.notifications.error("Invalid DamageBase!");
            return null;
        }

        const skipDialog = eventToRollParams(this.event).skipDialog;
        const rollMode = this.options.has("secret") ? (game.user.isGM ? "gmroll" : "blindroll") : "roll";

        const dialogContext = await (async () => {
            if (skipDialog) return {
                rollMode,
                fortuneType: null,
                statistic: this.statistic
            };

            return await CheckDialog.DisplayDialog({
                title,
                rollMode,
                statistic: this.statistic,
                type
            });
        })();
        if (!dialogContext) return null;

        const parts = /(\d+d\d+)(.*)/.exec(dice);
        const diceString = parts[1];
        const diceModifier = parts[2].split(/(?=[+-])/).map(m => m.replaceAll(' ', '').trim()).filter(m => m.length > 0).map(m => Number(m)).reduce((a, b) => a + b, 0);

        this.statistic.push(new PTUModifier({
            slug: "damage-base-modifier",
            label: "Damage Base Modifier",
            modifier: diceModifier,
        }))

        const attack = (() => {
            if (!this.item || !this.actor) return null;

            const attack = this.actor.system.attacks.get(this.item.realId);
            if (!attack) return null;

            return {
                actor: this.actor.uuid,
                id: attack.item.realId ?? attack.item._id,
                name: attack.item.name,
                targets: (() => {
                    const targets = this.contexts;
                    if (!targets) return null;

                    return targets.map(target => ({
                        actor: target.actor?.uuid,
                        token: target.token?.uuid ?? target.token?.id
                    }));
                })(),
            }
        })();

        const options = {
            origin: {
                actor: this.actor.uuid,
                item: this.item?.uuid,
                uuid: this.item?.uuid,
                type: 'move'
            },
            rollerId: game.userId,
            isReroll,
            totalModifiers: this.statistic.totalModifier,
            domains: this.selectors,
            targets: this.contexts.map(context => ({
                actor: context.actor.uuid,
                token: context.token.uuid,
                outcome: this.outcomes[context.actor.uuid] ?? null,
            })),
            outcomes: this.outcomes ?? {}
        }
        if (attack) options.attack = attack;
        if (this.fiveStrikeResult) options.fiveStrikeAmount = this.fiveStrikeResult;

        const totalModifiersPart = this.statistic.totalModifier?.signedString() ?? "";
        options.modifierPart = totalModifiersPart;

        // Add the dice modifier to the total modifier
        const diceModifierParts = this.diceModifiers.reduce((a, b) => {
            if (!b.ignored && !a[b.slug]) a[b.slug] = b.modifier;
            return a;
        }, {});

        const diceModifierTotal = Object.values(diceModifierParts).reduce((a, b) => a + b, 0);
        const totalModifier = (this.statistic.totalModifier ?? 0) + diceModifierTotal;

        // Fix for +0 modifier concatenation issue
        let rollFormula;
        if (totalModifier === 0) {
            rollFormula = diceString;
        } else {
            const signedModifier = totalModifier > 0 ? `+${totalModifier}` : `${totalModifier}`;
            rollFormula = `${diceString}${signedModifier}`;
        }
        const roll = await new DamageRoll(rollFormula, {}, options).evaluate();

        const critDice = `${diceString}+${diceString}`;
        
        // Use the original damageBaseModifier value for critical hit calculation
        // This represents the damage base modifier that should be doubled
        const otherModifiersTotal = (this.statistic.totalModifier ?? 0) - diceModifier;
        
        // For critical hits, double the damage base modifier
        const totalModifiersPartCrit = (otherModifiersTotal + (diceModifier * 2))?.signedString() ?? "";
        
        // Fix for +0 modifier concatenation issue in crit roll
        let critRollFormula;
        if (totalModifiersPartCrit === "+0" || totalModifiersPartCrit === "0") {
            critRollFormula = critDice;
        } else {
            critRollFormula = `${critDice}${totalModifiersPartCrit}`;
        }

        const diceResult = roll.terms.find(t => t instanceof foundry.dice.terms.DiceTerm);
        const fudges = {
            [`${diceResult.number}d${diceResult.faces}`]: diceResult.results,
        }

        const hasCrit = Object.values(this.outcomes).some(o => o == "crit-hit")
        const critRoll = await new DamageRoll(critRollFormula, {}, { ...options, crit: { hit: true, show: hasCrit, nonCritValue: roll.total }, fudges }).evaluate();

        const flags = {
            core: {
                canPopout: true
            },
            ptu: {
                context: {
                    actor: this.actor?.id ?? null,
                    token: this.token?.id ?? null,
                    domains: this.selectors ?? [],
                    targets: options.targets,
                    options: Array.from(this.options).sort(),
                    rollMode: dialogContext.rollMode,
                    rollTwice: !!dialogContext.fortuneType ?? false,
                    title,
                    type,
                    skipDialog,
                    isReroll,
                    outcomes: this.outcomes,
                    accuracyRollResult: this.accuracyRollResult
                },
                modifierName: this.statistic.slug,
                modifiers: this.statistic.modifiers.map(m => m.toObject()),
                origin: options.origin,
                attack
            }
        }

        const extraTags = this.fiveStrikeResult > 0 ? [`Five Strike x${this.fiveStrikeResult}`] : [];
        extraTags.push(...Object.entries(diceModifierParts).flatMap(([slug, mod]) => `${Handlebars.helpers.formatSlug(slug)} +${mod}`))

        const message = await this.createMessage({ roll, rollMode, flags, inverse: false, critRoll, type, extraTags });

        if (callback) {
            const msg = message instanceof ChatMessage ? message : new ChatMessage(message);
            const evt = !!this.event && this.event instanceof Event ? this.event : this.event?.originalEvent ?? null;
            await callback([roll, critRoll].filter(r => r), options.targets, msg, evt);
        }

        this.rolls = [roll];

        return {
            rolls: this.rolls,
            targets: options.targets,
        }
    }

    /**
     * Fully Executes the attack, including all checks and preparations
     * @param {StatisticModifier?} attackStatistic
     * @param {CheckCallback?} callback
     * @returns {Promise<DamageRoll>}
     */
    async executeDamage(callback = null, attackStatistic = null) {
        if (!Number.isNumeric(this.item?.damageBase?.preStab) || this.item.damageBase.preStab < 1) return;

        await this.prepareContexts(attackStatistic);

        this.prepareModifiers();
        this.prepareStatistic();

        await this.beforeRoll();

        const roll = await this.execute({
            isReroll: false,
            title: game.i18n.format("PTU.Action.DamageRoll", { move: this.item.name }),
            type: "damage-roll"
        }, callback);

        await this.afterRoll();
        return roll;
    }
}

export { PTUDamageCheck }