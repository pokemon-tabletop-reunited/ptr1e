import { CheckModifier, PTUModifier } from "../../actor/modifiers.js";
import { DamageRoll } from "./roll.js";

class PTUDamage {
    static async roll(data, context, event, callback) {
        const outcomes = context.outcomes ?? {};
        const targets = context.targets ?? [];
        const check = data.check;
        const damageBaseModifier = data.damage.modifier ?? 0;
        if (!check) return;

        check.push(new PTUModifier({
            slug: "damage-base-modifier",
            label: "Damage Base Modifier",
            type: context.item.system.category,
            category: context.item.system.category,
            modifier: damageBaseModifier,
        }));

        if (Array.isArray(context.options)) context.options = new Set(context.options);
        const rollOptions = context.options ?? new Set();

        if (rollOptions.has("secret")) context.rollMode ??= game.user.isGM ? "gmroll" : "blindroll";
        context.rollMode ??= "roll";

        if (rollOptions.size > 0 && !context.isReroll) {
            check.calculateTotal(rollOptions)
        }

        const isReroll = context.isReroll ?? false;
        if (isReroll) context.rollTwice = false;
        const substitutions = context.substitutions ?? [];
        const item = context.item;

        const attack = (() => {
            if (item && context.actor) {
                const attacks = context.actor?.system.attacks ?? [];
                const attack = attacks.get(item.realId);

                if (attack) {
                    return {
                        actor: context.actor.uuid,
                        id: attack.item.realId ?? attack.item._id,
                        name: attack.item.name,
                        targets: (() => {
                            const targets = context.targets;
                            if (!targets) return null;

                            return targets.map(target => ({
                                actor: target.actor?.uuid,
                                token: target.token?.uuid ?? target.token?.id
                            }));
                        })(),
                    }
                }
            }
            return null;
        })();

        const options = {
            rollerId: game.userId,
            isReroll,
            totalModifier: check.totalModifier,
            domains: context.domains,
            targets,
            outcomes
        }
        if(attack) options.attack = attack;

        const dice = data.damage.dice;

        const totalModifiersPart = check.totalModifier?.signedString() ?? "";
        const roll = await new DamageRoll(`${dice}${totalModifiersPart}`, {}, options).evaluate();

        const critDice = `${dice}+${dice}`;
        const totalModifiersPartCrit = ((check.totalModifier ?? 0) + damageBaseModifier)?.signedString() ?? "";
        const rollResult = roll.terms.find(t => t instanceof foundry.dice.terms.DiceTerm);
        const fudges = {
            [`${rollResult.number}d${rollResult.faces}`]: rollResult.results,
        }

        const hasCrit = Object.values(outcomes).some(o => o == "crit-hit")

        const critRoll = await new DamageRoll(`${critDice}${totalModifiersPartCrit}`, {}, {...options, crit: {hit: true, show: hasCrit, nonCritValue: roll.total}, fudges}).evaluate();

        const flavor = await (async () => {
            const result = undefined;// await this.createResultFlavor({ dc: context.dc, success, target: context.targets ?? null });
            const tags = this.createTagFlavor({ check })
            
            const header = document.createElement("div");
            header.classList.add("header-bar");
            const text = ((context.title?.replace(":", `<br>`)) || item?.name) ?? ""
            header.append((() => {
                const h3 = document.createElement("h3");
                h3.classList.add("action");
                h3.innerHTML = text;
                return h3;
            })());
            return [header, result ?? [], tags]
                .flat()
                .map(e => (typeof e === "string" ? e : e.outerHTML))
                .join("");
        })();

        const contextFlag = {
            ...context,
            item: undefined,
            actor: context.actor?.id ?? null,
            token: context.token?.id ?? null,
            domains: context.domains ?? [],
            targets: context.targets ? context.targets.map(target => ({ actor: target.actor?.uuid, token: target.token?.uuid, outcome: target.outcome })) : null,
            options: Array.from(rollOptions).sort(),
            rollMode: context.rollMode,
            rollTwice: context.rollTwice ?? false,
            title: context.title ?? "PTU.Check.Label",
            type: context.type ?? "check",
            substitutions,
            skipDialog: context.skipDialog,
            isReroll: context.isReroll ?? false,
        }
        delete contextFlag.item;

        const message = await (() => {
            const origin = item && { uuid: item.uuid, type: item.type };
            const coreFlags = {
                canPopout: true
            }
            if (context.type === "initiative") coreFlags.initiativeRoll = true;
            const flags = {
                core: coreFlags,
                ptu: {
                    context: contextFlag,
                    unsafe: flavor,
                    modifierName: check.slug,
                    modifiers: check.modifiers.map(m => m.toObject()),
                    origin,
                    attack
                }
            }

            const speaker = ChatMessage.getSpeaker({ actor: context.actor, token: context.token });
            return roll.toMessage({ speaker, flavor, flags }, { rollMode: contextFlag.rollMode, create: context.createMessage, critRoll});
        })();

        const rolls = [roll, critRoll].filter(r => r);

        if(callback) {
            const msg = message instanceof ChatMessage ? message : new ChatMessage(message);
            const evt = !!event && event instanceof Event ? event : event?.originalEvent ?? null;
            await callback(rolls, contextFlag.targets, msg, evt);
        }

        return rolls;
    }

    static createTagFlavor({ check }) {
        const toTagElement = (tag, cssClass = null) => {
            const span = document.createElement("span");
            span.classList.add("tag");
            if (cssClass) span.classList.add(`tag-${cssClass}`);

            span.innerText = tag.label;

            if (tag.name) span.dataset.slug = tag.name;
            if (tag.description) span.dataset.description = tag.description;

            return span;
        };

        const modifiers = check.modifiers
            .filter(m => m.enabled)
            .map(m => {
                const sign = m.modifier < 0 ? "" : "+";
                const label = `${m.label} ${sign}${m.modifier}`;
                return toTagElement({ label, name: m.slug }, "transparent");
            })
        
        const modifiersAndExtras = document.createElement("div");
        modifiersAndExtras.classList.add("header-bar");
        modifiersAndExtras.classList.add("tags");
        modifiersAndExtras.append(...modifiers);

        return [modifiersAndExtras];
    }
}

export { PTUDamage }