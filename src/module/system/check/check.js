import { AttackRoll } from "./rolls/attack-roll.js";
import { CaptureRoll } from "./rolls/capture-roll.js";
import { CheckModifiersDialog } from "./dialogs/dialog.js";
import { CheckDiceModifiersDialog } from "./dialogs/diceDialog.js";
import { InitiativeRoll } from "./rolls/initiative-roll.js";
import { CheckRoll } from "./rolls/roll.js";
import { PTUToken } from "../../canvas/token/index.js";
import { CheckDialog } from "./dialogs/dialog.js";
import { PTUTokenDocument } from "../../canvas/token/document.js";
import { CheckModifier } from "../../actor/modifiers.js";

class PTUDiceCheck {
    /** @type {PTUToken[]} */
    _tokenTargets = [];
    /** @type {Map<string, TargetContext>} */
    _contexts = new Map();

    /** @type {CheckSource} */
    _source;

    /**
     * @param {Object} source
     * @param {PTUActor} source.actor
     * @param {PTUItem} source.item
     * @param {PTUTokenDocument} source.token
     * @param {Set<string>} source.options
     * @param {PTUToken[]} targets
     * @param {string[]} selectors
     * @param {Event?} event
     * @param {typeof CheckRoll} rollCls
     */
    constructor({ source, targets, selectors, event, rollCls }) {
        this._tokenTargets = targets;
        this._source = {
            actor: source.actor,
            item: source.item,
            token: source.token ?? canvas.tokens.controlled.find(t => t.actor === source.actor) ?? source.actor.getActiveTokens().shift() ?? null,
            options: source.options instanceof Set ? source.options : new Set(source.options),
        }
        /** @type {string[]} */
        this.selectors = selectors;

        /** @type {Set<string>} */
        this.conditionOptions = new Set([...(source.actor.getFilteredRollOptions("condition") ?? [])]);

        /** @type {Event?} */
        this.event = event;

        this._rollCls = rollCls ?? CheckRoll;

        /** @type {Set<string>} */
        this.targetOptions = new Set();
    }

    /** @type {TargetContext[]} */
    get contexts() {
        return this._contexts.contents;
    }

    get actor() {
        return this._source.actor;
    }
    get token() {
        return this._source.token;
    }
    get item() {
        return this._source.item;
    }
    get options() {
        return this._source.options;
    }

    get rollCls() {
        return this._rollCls;
    }

    /* -------------------------------------------- */
    /* Preperation                                  */
    /* -------------------------------------------- */

    /**
     * Prepares all contexts for the check
     * @returns {Promise<PTUDiceCheck>}
     */
    async prepareContexts(statistic = null) {
        this._contexts = new Collection();
        this.targetOptions = new Set(this.options);

        for (const target of this._tokenTargets) {
            const context = await this.actor.getContext({
                selfToken: this.token,
                targetToken: target,
                selfItem: this.item,
                domains: this.selectors,
                statistic
            });
            this._contexts.set(context.actor.uuid, context);
            this.targetOptions = new Set([...this.targetOptions, ...context.targetOptions]);
        }
        
        return this;
    }

    pushOptions(options) {
        this.targetOptions = new Set([...this.targetOptions, ...options]);
    }

    /**
     * Prepares all modifiers for the check
     * @returns {PTUDiceCheck}
     */
    prepareModifiers() {
        /** @type {CheckModifier[]} */
        const modifiers = []

        modifiers.push(
            ...extractModifiers(this.actor.synthetics, this.selectors, {injectables: {move: this.item, item: this.item, actor: this.actor}, test: this.targetOptions})
        )

        this.modifiers = modifiers;
        return this;
    }

    /**
     * Prepare StatisticModifiers for the check
     * @param {string} slug The slug of the statistic to prepare
     * @returns {PTUDiceCheck}
     */
    prepareStatistic(slug) {
        this.statistic = CheckModifier.create({
            slug: slug ?? this.item.name,
            modifiers: this.modifiers,
            rollOptions: this.targetOptions,
        })
        return this;
    }

    /* -------------------------------------------- */
    /* Execution                                    */
    /* -------------------------------------------- */

    /**
     * Any code that should be executed before the roll is made
     */
    async beforeRoll() {
        for(const rule of this.actor.rules.filter(r => !r.ignored)) {
            await rule.beforeRollAsync?.(this);
        }
    }

    /**
     * @param {Object} context
     * @param {number} context.diceSize
     * @param {boolean} context.isReroll
     * @param {Object} context.attack
     * @param {DcCollection} context.dcs
     * @param {string} context.title
     * @param {CheckCallback} callback
     * @returns 
     */
    async execute(context = { isReroll: false, dcs: { base: null, targets: [] }, title, type: "check" }, callback) {
        const { diceSize, isReroll, attack, dcs, title, type, rollModeArg, skipDialogArg } = context;
        
        const skipDialog  = skipDialogArg ?? eventToRollParams(this.event).skipDialog;

        const rollMode = rollModeArg ?? (this.options.has("secret") ? (game.user.isGM ? "gmroll" : "blindroll") : "roll");

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

        const dice = `1d${diceSize}`;

        const options = {
            origin: {
                actor: this.actor.uuid,
                item: this.item?.uuid,
            },
            rollerId: game.userId,
            isReroll,
            totalModifiers: this.statistic.totalModifier,
            domains: this.selectors,
            targets: this.contexts.map(context => ({
                actor: context.actor.uuid,
                token: context.token.uuid,
                dc: dcs?.targets.get(context.actor.uuid),
            })),
            dcs,
            outcomes: {}
        }
        if (attack) options.attack = attack;

        const isInfinity = this.statistic.totalModifier === Infinity;
        const totalModifiersPart = this.statistic.totalModifier?.signedString() ?? "";
        options.modifierPart = totalModifiersPart;

        let rollFormula;
        if (isInfinity) {
            rollFormula = dice;
        } else if (totalModifiersPart === "+0" || totalModifiersPart === "0") {
            rollFormula = dice;
        } else {
            rollFormula = dice;
            options.modifierValue = this.statistic.totalModifier;
        }
        const roll = new this.rollCls(rollFormula, {}, options);
        const rollResult = await roll.evaluate();
        
        const result =
            (rollResult.isDeterministic
                ? rollResult.terms.find(t => t instanceof foundry.dice.terms.NumericTerm)
                : rollResult.dice.find(d => d instanceof foundry.dice.terms.Die && d.faces === diceSize
                ))?.total ?? 1;

        options.rollResult = result;

        const total = rollResult.total;
        const targets = [];
        if (options.dcs?.targets.size > 0) {
            for (const dcTarget of options.dcs.targets.values()) {
                const context = this._contexts.get(dcTarget.uuid);
                const degree = (() => {
                    if (!context) return null;

                    if (result === 1 && !isInfinity) return "crit-miss"
                    if (dcTarget.critRange.includes(result)) return "crit-hit";
                    if (isInfinity || total >= dcTarget.value) return "hit";
                    return "miss";
                })();
                if (degree !== null) {
                    options.outcomes[dcTarget.uuid] = degree;

                    targets.push({
                        actor: context.actor.uuid,
                        token: context.token.uuid,
                        dc: dcTarget.value,
                        outcome: degree,
                        modifiers: context.modifiers,
                    })
                }
            }
        }
        else {
            const degree = (() => {
                if (type === "initiative") return null;
                if (result === 1 && !isInfinity) return "crit-miss"
                if (options.dcs?.baseCritRange.includes(result)) return "crit-hit";
                if (isInfinity || total >= options.dcs?.base) return "hit";
                return null;
            })();
            if (degree !== null) {
                options.outcomes.base = degree;

                targets.push({
                    actor: this.actor.uuid,
                    token: this.token.uuid,
                    dc: options.dcs.base,
                    outcome: degree,
                })
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
                    type,
                    skipDialog,
                    isReroll,
                    rollResult: result
                },
                modifierName: this.statistic.slug,
                modifiers: this.statistic.modifiers.map(m => m.toObject()),
                origin: options.origin,
                resolved: targets.length > 0 ? game.settings.get("ptu", "autoRollDamage") : false,
            }
        }
        if (attack) flags.ptu.attack = attack;
        if (type === "initiative") flags.core.initiativeRoll = true;

        const message = await this.createMessage({roll, rollMode, flags, type});

        if (callback) {
            const msg = message instanceof ChatMessage ? message : new ChatMessage(message);
            const evt = !!this.event && this.event instanceof Event ? this.event : this.event?.originalEvent ?? null;
            await callback([roll], targets, msg, evt);
        }

        this.rolls = [roll];

        return {
            rolls: this.rolls,
            targets,
            rollResult: result,
        }
    }

    /**
     * Any code that should be executed after the roll is made
     */
    async afterRoll() {
        for(const rule of this.actor.rules.filter(r => !r.ignored)) {
            await rule.afterRollAsync?.(this, this.rolls);
        }
    }

    /**
     * Creates a chat message for the check
     * @param {Roll} roll 
     * @param {string} rollMode 
     * @param {Object} flags 
     * @returns {ChatMessage}
     */
    async createMessage({roll, rollMode, flags, extraTags = [], inverse = false, critRoll = null, type}) {
        const flavor = this.createFlavor({title: flags.ptu.title ?? flags.ptu.context.title, extraTags, inverse, type})
            .flat()
            .map(e => (typeof e === "string" ? e : e.outerHTML))
            .join("");

        flags.ptu.unsafe = flavor;

        const speaker = ChatMessage.getSpeaker({ actor: this.actor, token: this.token });
        return roll.toMessage({
            speaker,
            flavor,
            flags
        }, {
            rollMode,
            create: true,
            critRoll
        })
    }

    /**
     * Creates the flavor for the check
     * @param {Object} context
     * @param {string[]} context.extraTags
     * @param {boolean} context.inverse to be used for Skill Checks to reverse order of modifiers & extra tags
     * @param {string} context.title
     * @returns 
     */
    createFlavor(context = { extraTags: [], inverse: false, title, type }) {
        const { extraTags, inverse, type } = context;
        const header = document.createElement("div");
        header.classList.add("header-bar", "title-bar");
        const isAttackOrDamageRoll = ["damage-roll", "attack-roll"].includes(type)
        if(isAttackOrDamageRoll) {
            header.append((() => {
                const h4 = document.createElement("h4");
                h4.classList.add("roll-type", type);
                h4.innerText = game.i18n.localize(`PTU.Action.${type}`);
                return h4;
            })());
        }
        header.append((() => {
            const h3 = document.createElement("h3");
            h3.classList.add("action");
            h3.innerHTML = isAttackOrDamageRoll ? this.item.name : ( context.title || this.item?.name);
            return h3;
        })());

        const tags = (() => {
            const toTagElement = (tag, cssClass = null) => {
                const span = document.createElement("span");
                span.classList.add("tag");
                if (cssClass) span.classList.add(`tag-${cssClass}`);

                span.innerText = tag.label;

                if (tag.name) span.dataset.slug = tag.name;
                if (tag.description) span.dataset.description = tag.description;

                return span;
            }

            const modifiers = this.statistic.modifiers
                .filter(m => m.enabled)
                .map(m => {
                    const sign = m.modifier < 0 ? "" : "+";
                    const label = `${m.label} ${sign}${m.modifier}`;
                    return toTagElement({ label, name: m.slug }, "transparent");
                })
            const tagsFromOptions = extraTags.map(t => toTagElement({label: game.i18n.localize(t)}, "transparent"));
            if (modifiers.length + tagsFromOptions.length === 0) return [];

            const modifiersAndExtras = document.createElement("div");
            modifiersAndExtras.classList.add("header-bar");
            modifiersAndExtras.classList.add("tags");
            if (inverse) modifiersAndExtras.append(...tagsFromOptions, ...modifiers);
            else modifiersAndExtras.append(...modifiers, ...tagsFromOptions);
            return [modifiersAndExtras];
        })();

        return [header, tags]
    }
}

/**
 * @deprecated Use PTUDiceCheck instead
 */
class PTUCheck {
    static async roll(check, context, event, callback, diceStatistic = null) {
        if (event) foundry.utils.mergeObject(context, eventToRollParams(event));

        context.skipDialog ??= game.settings.get("ptu", "skipRollDialog");
        context.createMessage ??= true;

        if (Array.isArray(context.options)) context.options = new Set(context.options);
        const rollOptions = context.options ?? new Set();

        if (rollOptions.has("secret")) context.rollMode ??= game.user.isGM ? "gmroll" : "blindroll";
        context.rollMode ??= "roll";

        if (rollOptions.size > 0 && !context.isReroll) {
            check.calculateTotal(rollOptions)
        }

        context.title ??= `${context.item?.name}: Attack Roll` ?? check.slug;

        if (!context.skipDialog && diceStatistic) {
            const dialogClosed = new Promise((resolve) => {
                new CheckDiceModifiersDialog(diceStatistic, resolve, context).render(true);
            });
            const rolled = await dialogClosed;
            if (!rolled) return null;
        }
        if (!context.skipDialog) {
            const dialogClosed = new Promise((resolve) => {
                new CheckModifiersDialog(check, resolve, context).render(true);
            });
            const rolled = await dialogClosed;
            if (!rolled) return null;
        }

        const isReroll = context.isReroll ?? false;
        if (isReroll) context.rollTwice = false;
        const substitutions = context.substitutions ?? [];
        const extraTags = [];

        const [dice, tagsFromDice] = (() => {
            const substitutions = context.substitutions?.filter((s) => (!s.ignored && s.predicate?.test(rollOptions)) ?? true) ?? [];

            if(diceStatistic) {
                const isOverwrite = context.type === "skill-check";
                if(isOverwrite) {
                    return [diceStatistic.totalModifier, diceStatistic.tags];
                }
            }

            const rollTwice = context.rollTwice ?? false;

            const fortuneMisfortune = new Set(
                substitutions
                    .map((s) => s.effectType)
                    .concat(rollTwice === "keep-higher" ? "fortune" : rollTwice === "keep-lower" ? "misfortune" : [])
                    .flat()
            );
            for (const trait of fortuneMisfortune) {
                rollOptions.add(trait);
            }

            const substitution = substitutions.at(-1);
            if (rollOptions.has("fortune") && rollOptions.has("misfortune")) {
                return ["1d20", ["PTU.Trait.Fortune", "PTU.Trait.Misfortune"]];
            }
            else if (substitution) {
                const extraTag = game.i18n.format("PTU.Check.Substitution", { substitution: substitution.label, type: substitution.effectType == "fortune" ? "PTU.Trait.Fortune" : "PTU.Trait.Misfortune" })

                return [substitution.value.toString(), [extraTag]];
            }
            else if (context.rollTwice === "keep-higher") {
                return ["2d20kh", ["PTU.Trait.Fortune"]];
            }
            else if (context.rollTwice === "keep-lower") {
                return ["2d20kl", ["PTU.Trait.Misfortune"]]
            }
            else {
                return ["1d20", []];
            }
        })();
        extraTags.push(...tagsFromDice);

        const isAttack = context.type === "attack-roll";
        const RollCls = (() => {
            switch (context.type) {
                case "attack-roll": return AttackRoll;
                case "capture-throw": return CheckRoll;
                case "capture-calculation": return CaptureRoll;
                case "initiative": return InitiativeRoll;
                case "skill-check": return CheckRoll;
                default: return CheckRoll;
            }
        })();

        const attack = (() => {
            const item = context.item;
            if (isAttack && item && context.actor) {
                const attacks = context.actor?.system.attacks ?? [];
                const attack = attacks.get(item.realId);//attacks.find(a => a.item?.id === item.id && a.item.slug === item.slug);

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
            origin: {
                actor: context.actor.uuid,
                item: context.item?.uuid
            },
            rollerId: game.userId,
            isReroll,
            totalModifiers: check.totalModifiers,
            domains: context.domains,
            targets: (context.targets ?? []).map(target => ({
                ...target, dc: (() => {
                    if (!target.dc) return null;
                    return {
                        value: Math.abs(target.dc.value) === Infinity ? "" + target.dc.value : target.dc.value,
                        flat: target.dc.flat,
                        slug: target.dc.slug
                    }
                })()
            }))
        };
        if (attack) options.attack = attack;

        const isInfinity = check.totalModifier === Infinity;
        const totalModifiersPart = check.totalModifier?.signedString() ?? "";
        options.modifierPart = totalModifiersPart;

        if (context.captureModifier) {
            options.captureModifier = context.captureModifier;
            options.checkModifier = totalModifiersPart;
        }

        // Fix for +0 modifier concatenation issue
        let rollFormula;
        if (isInfinity) {
            rollFormula = dice;
        } else if (totalModifiersPart === "+0" || totalModifiersPart === "0") {
            // Handle +0 case properly to avoid concatenation issues
            rollFormula = dice;
        } else {
            rollFormula = `${dice}${totalModifiersPart}`;
        }
        const roll = await new RollCls(rollFormula, {}, options).evaluate();

        for (const target of context.targets ?? []) {
            const [success, degree] = target.dc ? (() => {
                const critModifier = (() => {
                    const actor = context.actor;
                    if (!actor) return 0;

                    return actor.system.modifiers?.critRange?.total ?? 0;
                })();

                const result =
                    (roll.isDeterministic
                        ? roll.terms.find(t => t instanceof foundry.dice.terms.NumericTerm)
                        : roll.dice.find(d => d instanceof foundry.dice.terms.Die && (d.faces === 20 || d.faces === 100))
                    )?.total ?? 1;
                const total = roll.total;
                const dc = target.dc;

                if (roll instanceof CaptureRoll) {
                    if (result === 1 || result === 100) return [true, "crit-hit"];
                    if (total <= dc.value) return [true, "hit"];
                    return [false, "miss"];
                }

                if (dc.flat) {
                    if (total >= dc.value) return [true, "hit"];
                    return [false, "miss"];
                }

                if (result === 1 && !isInfinity) return [false, "crit-miss"];
                if (result >= 20 - critModifier) {
                    // If target is immune to crit; return hit
                    if (target.options.has("target:immune:crit")) return [true, "blocked-crit"];

                    return [true, "crit-hit"];
                }
                if (isInfinity || total >= dc.value) return [true, "hit"];
                return [false, "miss"];
            })() : [null, null];

            if (context.dc && success === null && degree === null) {
                const result = roll.total;
                const dc = context.dc.value;

                if (result >= dc) {
                    target.outcome = "hit";
                    if (!roll.options.outcome) roll.options.outcome = {};
                    roll.options.outcome[target.actor?._id] = "hit";
                }
            }
            else if (success !== null) {
                target.outcome = degree;
                if (!roll.options.outcome) roll.options.outcome = {};
                roll.options.outcome[target.actor?._id] = degree;
            }
        }

        const item = context.item ?? null;

        const flavor = await (async () => {
            const result = undefined;// await this.createResultFlavor({ dc: context.dc, success, target: context.targets ?? null });
            const tags = this.createTagFlavor({ check, context, extraTags })
            const typeAndCategoryHeader = (() => {
                if (!item || !isAttack) return null;

                const header = document.createElement("div");
                header.classList.add("header-bar");
                header.classList.add("type-category");

                const type = document.createElement("div");
                type.classList.add("type-img");

                const typeImg = document.createElement("img");
                typeImg.src = CONFIG.PTU.data.typeEffectiveness[item.system.type].images.bar;
                type.append(typeImg);

                const category = document.createElement("div");
                category.classList.add("type-img");

                const categoryImg = document.createElement("img");
                categoryImg.src = `/systems/ptu/static/css/images/categories/${item.system.category}.png`;
                category.append(categoryImg);

                header.append(category, type);
                return [header]
            })();

            const header = document.createElement("div");
            header.classList.add("header-bar");
            header.append((() => {
                const h3 = document.createElement("h3");
                h3.classList.add("action");
                h3.innerHTML = item?.name ?? context.title;
                return h3;
            })());
            return [header, result ?? [], typeAndCategoryHeader ?? [], tags]
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
            targets: context.targets ? context.targets.map(target => ({ actor: target.actor?.uuid, token: target.token?.uuid, dc: target.dc, outcome: target.outcome })) : null,
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

        const resolved = context.targets?.length > 0
            ? game.settings.get("ptu", "autoRollDamage")
            : false;

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
                    attack,
                    resolved
                }
            }

            const speaker = ChatMessage.getSpeaker({ actor: context.actor, token: context.token });
            return roll.toMessage({ speaker, flavor, flags }, { rollMode: contextFlag.rollMode, create: context.createMessage });
        })();

        const rolls = [roll];

        if (callback) {
            const msg = message instanceof ChatMessage ? message : new ChatMessage(message);
            const evt = !!event && event instanceof Event ? event : event?.originalEvent ?? null;
            await callback(rolls, contextFlag.targets, msg, evt);
        }

        return roll;
    }

    static async createResultFlavor({ dc, success, target }) {
        if (success === null) return null;

        const label = `<dc>${game.i18n.localize(dc.slug)}: ${dc.value}</dc>`;

        const targetActor = await (async () => {
            if (!target?.actor) return null;
            if (target.actor instanceof CONFIG.PTU.Actor.documentClass) return target.actor;

            const maybeActor = await fromUuid(target.actor);
            return maybeActor instanceof CONFIG.PTU.Actor.documentClass
                ? maybeActor
                : maybeActor instanceof CONFIG.PTU.Token.objectClass
                    ? maybeActor.actor
                    : null;
        })();

        const targetData = await (async () => {
            if (!target) return null;

            const token = await (async () => {
                if (!target.token) return null;
                if (target.token instanceof CONFIG.PTU.Token.objectClass) return target.token;
                if (target.token instanceof CONFIG.Token.documentClass) return target.token.object;
                if (targetActor?.token) return targetActor.token;

                return fromUuid(target.token);
            })();

            const canSeeTokenName = (() => {
                const tokenDocument = (token ?? new CONFIG.Token.documentClass(targetActor?.prototypeToken.toObject() ?? {}))
                return [CONST.TOKEN_DISPLAY_MODES.ALWAYS, CONST.TOKEN_DISPLAY_MODES.HOVER].includes(tokenDocument.displayName);
            })();

            return {
                name: token?.name ?? targetActor?.name ?? "",
                visible: !!canSeeTokenName
            }
        })();

        const dcData = {
            visible: targetActor?.hasPlayerOwner ?? false,
            markup: `<target>Target: ${targetData?.name ?? game.user.name}</target> ${label}`
        }

        const resultData = {
            visible: game.user.isGM,
            markup: `<result>${success}</result>`
        }

        return await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/check/target-dc-result.hbs", {
            target: targetData,
            dc: dcData,
            result: resultData
        });

    }

    static createTagFlavor({ check, context, extraTags }) {
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
        const tagsFromOptions = extraTags.map(t => toTagElement({ label: game.i18n.localize(t) }, "transparent"));

        const modifiersAndExtras = document.createElement("div");
        modifiersAndExtras.classList.add("header-bar");
        modifiersAndExtras.classList.add("tags");
        if (modifiers?.length + tagsFromOptions?.length === 0) return [];
        if(context.type === "skill-check") modifiersAndExtras.append(...tagsFromOptions, ...modifiers);
        else modifiersAndExtras.append(...modifiers, ...tagsFromOptions);

        return [modifiersAndExtras];
    }
}

function eventToRollParams(event) {
    const skipDefault = game.settings.get("ptu", "skipRollDialog");
    if (!isRelevantEvent(event)) return { skipDialog: skipDefault };

    const params = { skipDialog: event.shiftKey ? !skipDefault : skipDefault };
    if (event.ctrlKey || event.metaKey) {
        params.rollMode = game.user.isGM ? "gmroll" : "blindroll";
    }

    return params;
}

function isRelevantEvent(event) {
    return (!!event) && ("ctrlKey" in event) && ("shiftKey" in event);
}

/**
 * @typedef {Object} CheckContext
 * @property {PTUActor} actor The actor that is the origin of the check
 * @property {PTUItem} item The item that is the origin of the check
 * @property {PTUTokenDocument} token The token that is the origin of the check
 * @property {string[]} domains Domains related tot his check for fetching actor roll options
 * @property {Set<string>} options Roll options for this check
 * @property {Object[]} substitutions
 * @property {string} type
 * @property {TargetObject[]} targets
 */

/**
 * @typedef {Object} TargetObject
 * @property {PTUActor} actor The actor that is the target of the check
 * @property {PTUTokenDocument} token The token that is the target of the check
 * @property {Object} dc The difficulty class of the check against this target
 * @property {number} dc.value The difficulty class of the check against this target
 * @property {string} dc.slug The slug of the difficulty class of the check against this target
 * @property {number} distance The distance between the origin and the target
 * @property {Set<string>} options Roll options for this check against this target
 */

/** 
 * @typedef {Object} CheckSource
 * @property {PTUActor} actor
 * @property {PTUItem} item
 * @property {PTUTokenDocument} token
 * @property {Set<string>} options
 */

/**
 * @callback CheckCallback
 * @param {Object} rolls
 * @param {TargetObjects[]} targets
 * @param {Object} msg
 * @param {Event} event
 */

/**
 * @typedef {Object} TargetContext
 * @property {PTUActor} actor The actor that is the target of the check
 * @property {PTUTokenDocument} token The token that is the target of the check
 * @property {number} distance The distance between the origin and the target
 * @property {Set<string>} options Roll options for this check against this target
 */

/**
 * @typedef {Object} DcCollection
 * @property {number} base The base difficulty class of the check
 * @property {number[]} baseCritRange The critical range of the check against the base difficulty class
 * @property {Map<string, TargetDC>} targets The difficulty class of the check against each target
 */

/**
 * @typedef {Object} TargetDC
 * @property {string} slug The slug of the difficulty class of the check against this target
 * @property {Object} uuid the UUID of the actor that is the target of the check
 * @property {number} value The difficulty class of the check against this target
 * @property {number[]} critRange The critical range of the check against this target
 */

export { PTUDiceCheck, PTUCheck, eventToRollParams }