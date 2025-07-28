import { sluggify } from "../../../util/misc.js";
import { PTUDiceModifier, PTUModifier, StatisticDiceModifier, StatisticModifier } from "../../actor/modifiers.js";
import { PTUDiceCheck, eventToRollParams } from "./check.js";
import { CheckDialog } from "./dialogs/dialog.js";
import { DiceCheckDialog } from "./dialogs/diceDialog.js";
import { CheckRoll } from "./rolls/roll.js";

class PTUSkillCheck extends PTUDiceCheck {

    /** @override */
    constructor({ source, targets, selectors, event, action, dc }) {
        super({ source, targets, selectors, event });
        this.action = action;
        this.dc = dc;
    }

    get rollCls() {
        return CheckRoll;
    }

    get skill() {
        return this.action.skill;
    }

    get skillLabel() {
        return game.i18n.localize(`PTU.Skills.${this.skill}`);
    }

    /**
     * @override
     */
    prepareModifiers() {
        super.prepareModifiers();

        /** @type {PTUDiceModifier[]} */
        const diceModifiers = [
            new PTUDiceModifier({
                diceNumber: Math.clamp(this.actor.system.skills[this.skill]?.value?.total ?? 1, 1, 6),
                dieSize: 6,
                label: game.i18n.format("PTU.Check.SkillDice", { skill: this.skillLabel })
            })
        ]

        const modifiers = [
            new PTUModifier({
                label: game.i18n.format("PTU.Check.SkillMod", { skill: this.skillLabel }),
                modifier: this.actor.system.skills[this.skill]?.modifier?.total ?? 0
            }),
            ...this.modifiers
        ]

        diceModifiers.push(
            ...extractModifiers(this.actor.synthetics, ["all", "skill-check-dice", `skill-${this.skill}-dice`], {injectables: {move: this.item, item: this.item, actor: this.actor}, test: this.targetOptions}).reduce((arr, mod) => {
                if(mod instanceof PTUDiceModifier) {
                    arr.push(mod);
                }
                else if(mod instanceof PTUModifier) {
                    if(typeof mod.value === "string") {
                        const diceNumber = Number(mod.value.match(/^-?\d+/)?.[0]);
                        const dieSize = Number(mod.value.match(/d\d+/)?.[0]?.replace("d", ""));
                        if(!isNaN(diceNumber) && !isNaN(dieSize)) {
                            arr.push(new PTUDiceModifier({
                                ...mod.toObject(),
                                diceNumber,
                                dieSize,
                            }))
                        }
                    }
                    else if(!isNaN(Number(mod.value))) {
                        arr.push(new PTUDiceModifier({
                            ...mod.toObject(),
                            diceNumber: Number(mod.value),
                            dieSize: 6
                        }));
                    }
                }
                return arr;
            }, [])
        )

        this.modifiers = modifiers;
        this.diceModifiers = diceModifiers;

        return this;
    }

    /**
     * @override
     * @returns {PTUAttackCheck}
     */
    prepareStatistic() {
        const slug = sluggify(this.action.label)
        super.prepareStatistic(slug);
        this.diceStatistic = new StatisticDiceModifier(
            slug,
            this.diceModifiers,
            this.targetOptions,
        )
        return this;
    }

    /* -------------------------------------------- */
    /* Execution                                    */
    /* -------------------------------------------- */

    /**
     * @override 
     * @param {CheckCallback?} callback
    */
    async execute(callback, isReroll = false) {
        const title = this.action.label;
        const { skipDialog } = eventToRollParams(this.event);;

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
                type: "skill"
            });
        })();
        if (!dialogContext) return null;

        const diceDialogContext = await (async () => {
            if (skipDialog) return {
                rollMode,
                fortuneType: null,
                statistic: this.diceStatistic
            };

            return await DiceCheckDialog.DisplayDialog({
                title,
                rollMode,
                statistic: this.diceStatistic,
                type: "check"
            });
        })();
        if (!diceDialogContext) return null;

        const dice = this.diceModifiers.map(mod => `${mod.diceNumber}d${mod.dieSize}`).join(" + ");

        const options = {
            origin: {
                actor: this.actor.uuid,
                item: this.item?.uuid,
                token: this.token?.document?.uuid,
            },
            rollerId: game.userId,
            isReroll,
            totalModifiers: this.statistic.totalModifier,
            domains: this.selectors,
            targets: this.contexts.map(context => ({
                actor: context.actor.uuid,
                token: context.token.uuid,
                dc: this.dc ? {
                    value: this.dc.value,
                    slug: this.dc.slug
                } : null
            })),
            type: "skill-check",
            skill: this.skill,
            dc: this.dc,
            outcomes: {}
        }

        const isInfinity = this.statistic.totalModifier === Infinity;
        const total = this.statistic.totalModifier ?? 0;
        const totalModifiersPart = (total === Infinity) ? "" : (total >= 0 ? `+${total}` : `${total}`);
        options.modifierPart = totalModifiersPart;

        // Fix for +0 modifier concatenation issue
        let rollFormula;
        if (isInfinity) {
            rollFormula = dice;
        } else if (total === 0) {
            rollFormula = dice;
        } else {
            rollFormula = `${dice}${totalModifiersPart}`;
        }
        const roll = new this.rollCls(rollFormula, {}, options);
        const rollResult = await roll.evaluate();

        const targets = []
        if (options.dc) {
            const degree = rollResult.total >= options.dc.value ? "hit" : "miss"
            targets.push({
                actor: options.dc.uuids.actor,
                token: options.dc.uuids.token,
                dc: options.dc.value,
                outcome: degree
            })
            options.outcomes[options.dc.uuids.actor] = degree;
        }
        else {
            for (const context of this.contexts) {
                const target = {
                    actor: context.actor.uuid,
                    token: context.token.uuid,
                }
                targets.push(target);
            }
        }

        const flags = {
            core: {
                canPopout: true
            },
            ptu: {
                context: {
                    actor: this.actor?.id ?? null,
                    token: this.token?.id ?? null,
                    domains: this.selectors ?? [],
                    targets,
                    options: Array.from(this.options).sort(),
                    rollMode: dialogContext.rollMode,
                    rollTwice: !!dialogContext.fortuneType ?? false,
                    title,
                    type: "skill-check",
                    skipDialog,
                    isReroll,
                    skill: this.skill
                },
                modifierName: this.statistic.slug,
                modifiers: this.statistic.modifiers.map(m => m.toObject()),
                origin: options.origin,
                title
            }
        }

        const message = await this.createMessage({roll, rollMode, flags, extraTags: diceDialogContext.statistic.tags, inverse: true});

        if (callback) {
            const msg = message instanceof ChatMessage ? message : new ChatMessage(message);
            const evt = !!this.event && this.event instanceof Event ? this.event : this.event?.originalEvent ?? null;
            await callback([roll], targets, msg, evt);
        }

        this.rolls = [roll];

        return {
            rolls: this.rolls,
            targets,
        }
    }

    /**
     * Fully Executes the attack, including all checks and preparations
     * @param {StatisticModifier?} skillStatistic
     * @param {CheckCallback?} callback
     * @returns {Promise<AttackRoll>}
     */
    async executeCheck(callback = null, skillStatistic = null) {
        await this.prepareContexts(skillStatistic);

        this.prepareModifiers();
        this.prepareStatistic();

        await this.beforeRoll();
        const roll = await this.execute(callback);
        await this.afterRoll();

        return roll;
    }
}

/**
 * @callback CheckCallback
 * @param {Object} rolls
 * @param {TargetObjects[]} targets
 * @param {Object} msg
 * @param {Event} event
 */

export { PTUSkillCheck }
