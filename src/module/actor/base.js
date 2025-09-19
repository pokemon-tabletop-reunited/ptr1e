import { sluggify } from "../../util/misc.js";
import { Weather } from "../apps/weather.js";
import { PTUCombatant } from "../combat/combatant.js";
import { PTUCondition } from "../item/index.js";
import { ChatMessagePTU } from "../message/base.js";
import { extractEphemeralEffects, processPreUpdateActorHooks } from "../rules/helpers.js";
import { PTUAttackCheck } from "../system/check/attack.js";
import { PTUDiceCheck, eventToRollParams } from "../system/check/check.js";
import { PTUDamageCheck } from "../system/check/damage.js";
import { InitiativeRoll } from "../system/check/rolls/initiative-roll.js";
import { PTUSkillCheck } from "../system/check/skill.js";
import { PTUDamage } from "../system/damage/damage.js";
import { PTUMoveDamage } from "../system/damage/move.js";
import { ActorConditions } from "./conditions.js";
import { IWRData, ImmunityData, ResistanceData, WeaknessData } from "./iwr.js";
import { PTUModifier, StatisticModifier } from "./modifiers.js";

/** @typedef {import('../../module/rules/rule-element/base').RuleElementPTU} RuleElementPTU */

/**
 * @class PTUActor
 */
class PTUActor extends Actor {

    /** Most actor types can host rule elements */
    get canHostRuleElements() {
        return true;
    }

    get rollOptions() {
        return this.flags.ptu?.rollOptions;
    }

    get combatant() {
        return game.combat?.combatants.find((c) => c.actorId == this.id && ((c.isBoss && c.isPrimaryBossCombatant) || !c.isBoss)) ?? null;
    }

    get sourceId() {
        return this.flags.core?.sourceId ?? null;
    }

    get schemaVersion() {
        return Number(this.system.schema?.version) || null;
    }

    get allowedItemTypes() {
        return ["effect"]
    }

    get origins() {
        return this.system.changes;
    }

    get identified() {
        return this.flags.ptu?.identified !== false;
    }

    get sizeClass() {
        return "Medium;"
    }

    get alliance() {
        return this.system.alliance;
    }

    get isPrivate() {
        // TODO : make this a meta knowledge setting
        return !(this.permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
    }

    get types() {
        return this.synthetics.typeOverride.typing
            || this.system.typing
            || (this.system.modifiers.typeOverwrite
                ? Array.isArray(this.system.modifiers.typeOverwrite)
                    ? this.system.modifiers.typeOverwrite.filter(x => x)
                    : [this.system.modifiers.typeOverwrite].filter(x => x)
                : undefined
            )
            || ["Untyped"];
    }

    /** @override */
    get itemTypes() {
        return this._itemTypes ??= super.itemTypes;
    }

    get attacks() {
        return this.system.attacks;
    }

    get iwr() {
        const iwr = this._iwr ?? this.prepareIwr();

        /** @type {IWRData[]} */
        const effectiveness = this.synthetics.effectiveness.flatMap(d => d({ injectables: { acor: this }, test: this.getRollOptions(["all", "initiative"]) }) ?? []).reduce((acc, curr) => {
            acc.set(`${curr.type}:${curr.source}`, curr);
            return acc;
        }, new Map());

        const resistances = [...iwr.resistances];
        const weaknesses = [...iwr.weaknesses];
        const immunities = [...iwr.immunities];
        const all = { ...iwr.all };

        for (const effect of effectiveness.values()) {
            if (effect instanceof ImmunityData) {
                immunities.push(effect);
                all[effect.type] = 0;
            }
            if (effect instanceof WeaknessData) {
                weaknesses.push(effect);
                all[effect.type] = (all[effect.type] ?? 1) * effect.value;
            }
            if (effect instanceof ResistanceData) {
                resistances.push(effect);
                all[effect.type] = (all[effect.type] ?? 1) * effect.value;
            }
        }

        const IWR = {
            resistances,
            weaknesses,
            immunities,
            all,
            getRealValue(type) {
                const realType = type.toLocaleLowerCase(game.i18n.locale);
                const value = all[realType] ?? 1;

                if (value > 1) return value > 2 ? Math.log2(value) : value == 2 ? 1.5 : value
                return value;
            }
        }

        return IWR;
    }

    prepareIwr() {
        const results = {
            immunities: [],
            weaknesses: [],
            resistances: [],
            all: {}
        }
        let i = 0;
        const effectiveness = {};

        for (const type of this.types) {
            const iwr = foundry.utils.duplicate(CONFIG.PTU.data.typeEffectiveness[type]?.effectiveness ?? {});

            for (const [key, value] of Object.entries(iwr)) {
                effectiveness[key] = (effectiveness[key] ?? 1) * value;
            }
        }
        if (!game.settings.get("ptu", "homebrew.nuclearType")) {
            delete effectiveness["Nuclear"];
        }
        if (!game.settings.get("ptu", "homebrew.shadowType")) {
            delete effectiveness["Shadow"];
        }
        else {
            if (this.types.includes("Shadow")) effectiveness["Shadow"] = 0.5;
            else if (this.types.includes("Untyped")) effectiveness["Shadow"] = 1;
            else effectiveness["Shadow"] = 2;
        }

        const effectivenessMod = (() => {
            const mod = this.system.modifiers?.resistanceSteps?.total ?? 0;
            if(mod > 0) return 1 / (2 ** mod);
            if(mod < 0) return 2 ** Math.abs(mod);
            return 1;
        })();
        for (let [key, value] of Object.entries(effectiveness)) {
            if (effectivenessMod) value *= effectivenessMod;
            const type = key.toLocaleLowerCase(game.i18n.locale)

            if (value == 0) {
                results.immunities.push(new ImmunityData({ type, value, source: "type" }));
                results.all[type] = 0;
                continue;
            }
            if (value == 1) {
                results.all[type] = 1;
                continue;
            }
            if (value < 1) {
                results.resistances.push(new ResistanceData({ type, value, source: "type" }));
                results.all[type] = value;
                continue;
            }
            if (value > 1) {
                results.weaknesses.push(new WeaknessData({ type, value, source: "type" }));
                results.all[type] = value;
                continue;
            }
        }

        return this._iwr = results;
    }

    get primaryUpdater() {
        const activeUsers = game.users.filter((u) => u.active);

        // 1. The first active GM, sorted by ID
        const firstGM = activeUsers
            .filter((u) => u.isGM)
            .sort((a, b) => (a.id > b.id ? 1 : -1))
            .shift();
        if (firstGM) return firstGM;

        // 2. The user with this actor assigned
        const primaryPlayer = this.isToken ? null : activeUsers.find((u) => u.character?.id === this.id);
        if (primaryPlayer) return primaryPlayer;

        // 3. Anyone who can update the actor
        const firstUpdater = game.users
            .filter((u) => this.canUserModify(u, "update"))
            .sort((a, b) => (a.id > b.id ? 1 : -1))
            .shift();
        return firstUpdater ?? null;
    }

    /** @override */
    _initialize() {
        this._itemTypes = null;
        this._iwr = null;
        this.rules = [];
        this.initiative = null;
        this.conditions = new ActorConditions();

        this.synthetics = {
            ephemeralEffects: {},
            modifierAdjustments: { all: [], damage: [] },
            statisticsModifiers: { all: [], damage: [] },
            rollSubstitutions: {},
            rollNotes: {},
            damageDice: {},
            tokenOverrides: {},
            speciesOverride: {},
            typeOverride: {},
            effectiveness: [],
            apAdjustments: { drained: [], bound: [] },
            applyEffects: {}
        }

        super._initialize();
    }

    /** @override */
    prepareData() {
        this.constructed = false;
        super.prepareData();
        this.constructed = true;

        // Extra Rolloptions before 'After Derived' hooks get called
        if (!this.types.includes("Untyped")) delete this.flags.ptu.rollOptions.all["self:types:untyped"]
        for (const type of this.types) {
            this.flags.ptu.rollOptions.all["self:types:" + type.toLowerCase()] = true;
        }

        // Call post-derived-preparation `RuleElement` hooks
        for (const rule of this.rules) {
            rule.afterPrepareData?.();
        }

        this.prepareDerivedData();

        this.initiative = this.prepareInitiative();//new ActorInitiative(this);

        // Set origins
        this._setDefaultChanges();

        // Refresh sidebar if needed
        if (this.constructed && canvas.ready && game.ptu) {
            const thisTokenIsControlled = canvas.tokens.controlled.some(
                t => t.document === this.parent || (t.document.actorLink && t.actor === this)
            )
            if (game.user.character === this || thisTokenIsControlled) {
                game.ptu.tokenPanel.refresh();
            }
        }
    }

    /** @override */
    prepareBaseData() {
        const { flags } = this;

        // Setup the basic structure of PTU flags with roll options
        this.flags.ptu = foundry.utils.mergeObject(flags.ptu ?? {}, {
            rollOptions: {
                all: {
                    [`self:type:${this.type}`]: true,
                    [`self:id:${this.id}`]: true,
                }
            },
            disabledOptions: []
        });

        this.system.changes = this.system.changes ?? {};

        this.system.alliance = ["party", "opposition", null].includes(this.system.alliance)
            ? this.system.alliance
            : this.hasPlayerOwner
                ? "party"
                : "opposition";
    }

    prepareDerivedData() {
        this.prepareSynthetics();

        if (this.allowedItemTypes.includes('move')) {
            this.system.attacks = this.prepareMoves();
        }

        this.system.spirit.weary = this.system.spirit.value >= 0 ? 0 : Math.abs(this.system.spirit.value);
    }

    /** @override */
    prepareEmbeddedDocuments() {
        super.prepareEmbeddedDocuments();

        for (const effect of [this.itemTypes.effect, this.itemTypes.condition].flat()) {
            game.ptu.effectTracker.register(effect);
        }

        this.prepareDataFromItems();


        for (const rule of this.rules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) {
            rule.onApplyActiveEffects?.();
        }
    }

    prepareDataFromItems() {
        for (const item of this.items) {
            item.prepareSiblingData?.();
            item.prepareActorData?.();
        }

        /**
         * @type {RuleElementPTU[]}
         */
        this.rules = this.prepareRuleElements();
    }

    prepareRuleElements() {
        const globalEffects = [];
        try {
            for (const effect of Weather.globalEffects?.values?.() ?? []) {
                switch(effect.system.mode) {
                    case "disabled": 
                        continue;
                    case "all":
                        break;
                    case "players":
                        if (this.alliance !== "party") continue;
                        break;
                    case "opposition":
                        if (this.alliance !== "opposition") continue;
                        break;
                }

                const item = new CONFIG.PTU.Item.proxy(effect.toObject(), { temporary: true, parent: this })
                item.updateSource({ "flags.core.sourceId": effect.flags?.core?.sourceId ?? effect.uuid });
                globalEffects.push(item);
            }
        }
        catch (error) {
            console.error("PTU | Failed to prepare global effects.", error);
        }
        return [
            this.items.contents.flatMap((item) => item.prepareRuleElements()),
            globalEffects.flatMap((effect) => effect.prepareRuleElements())
        ]
            .flat()
            .filter((rule) => !rule.ignored)
            .sort((a, b) => a.priority - b.priority);
    }

    prepareSynthetics() {
        // Call pre-derived-preparation `RuleElement` hooks
        for (const rule of this.rules.filter((r) => !r.ignored)) {
            try {
                rule.beforePrepareData?.();
            } catch (error) {
                // Ensure that a failing rule element does not block actor initialization
                console.error(`PTU | Failed to execute onBeforePrepareData on rule element ${rule}.`, error);
            }
        }
    }

    isAllyOf(actor) {
        return this.alliance !== null && this !== actor && this.alliance === actor.alliance;
    }

    isEnemyOf(actor) {
        return this.alliance !== null && actor.alliance !== null && this.alliance !== actor.alliance;
    }

    /**
     * Retrieve all roll option from the requested domains. Micro-optimized in an excessively verbose for-loop.
     * @param domains The domains of discourse from which to pull options. Always includes the "all" domain.
     */
    getRollOptions(domains = []) {
        if (!Array.isArray(domains)) domains = [domains];
        const withAll = Array.from(new Set(["all", ...domains]));
        const { rollOptions } = this;
        const toReturn = new Set();

        for (const domain of withAll) {
            for (const [option, value] of Object.entries(rollOptions[domain] ?? {})) {
                if (value) toReturn.add(option);
            }
        }

        return Array.from(toReturn).sort();
    }

    getSelfRollOptions(prefix = "self") {
        return Object.keys(this.rollOptions.all ?? {}).flatMap(o =>
            o.startsWith("self:") && this.rollOptions.all[o] ? o.replace(/^self/, prefix) : []
        );
    }

    getFilteredRollOptions(prefix, domains = []) {
        if (!prefix) return this.getRollOptions();
        return this.getRollOptions(domains).filter(o => o.startsWith(prefix));
    }

    // Disable Active Effects as they are replaced by RuleElements
    /** @override */
    applyActiveEffects() {
        return;
    }

    /** @override */
    static async createDocuments(data = [], context = {}) {
        for (const actorData of data) {
            if (actorData.prototypeToken?.actorLink !== true) {
                actorData.prototypeToken ??= {};
                actorData.prototypeToken.actorLink = true;
            }
        }
        return super.createDocuments(data, context);
    }

    /** @override */
    async createEmbeddedDocuments(embeddedName, data = [], context = {}) {
        if (embeddedName === "ActiveEffect") {
            console.warn("PTU | Active Effects are disabled.");
            return false;
        }

        return super.createEmbeddedDocuments(embeddedName, data, context);
    }

    /** @override */
    static async updateDocuments(updates, context) {
        for (const changed of updates) {
            await processPreUpdateActorHooks(changed, { pack: context.pack ?? null })
        }

        return super.updateDocuments(updates, context);
    }

    _onCreate(data, options, user) {
        super._onCreate(data, options, user);
        if(user !== game.user.id) return;
        if(data.type === 'character') {
            if(!data.items.some(i => i.name.endsWith("Training"))) {
                // Grant lvl 1 training
                fromUuid('Compendium.ptu.effects.Item.fm0TZUuQK0uRhkJA').then((effect) => {
                    this.createEmbeddedDocuments('Item', [effect.toObject()]);
                });
            }
        }
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        if (changed?.system?.spirit?.value !== undefined) {
            changed.system.spirit.value = Math.clamp(
                changed.system.spirit.value,
                this.system.spirit.min ?? this.system.spirit.min,
                changed.system.spirit.max ?? this.system.spirit.max
            );
        }

        await super._preUpdate(changed, options, user);
    }

    getContextualClone(rollOptions, ephemeralEffects = []) {
        const rollOptionsAll = rollOptions.reduce((options, option) => ({ ...options, [option]: true }), {});

        return this.clone(
            {
                items: [foundry.utils.deepClone(this._source.items), ephemeralEffects].flat(),
                flags: { ptu: { rollOptions: { all: rollOptionsAll } } },
            },
            { keepId: true }
        )
    }

    async applyDamage({
        damage,
        token,
        item,
        effectiveness,
        rollOptions = new Set(),
        breakdown = [],
        notes = [],
        skipIWR = false,
    }) {
        const health = this.system.health;
        if (!health) return this;

        const flatDamage = effectiveness === -1;
        if (flatDamage) effectiveness = 1;

        const currentDamage = typeof damage === "number"
            ? damage
            : damage.total;
        const applications = [];

        // Calculate defenses & damage reduction
        const defense = (() => {
            if (flatDamage) return 0;
            const option = rollOptions.find(o => o.startsWith("item:overwrite:defense"));
            if (option) {
                const stat = option.replace(/(item:overwrite:defense:)/, "");
                const value = this.system.stats[stat]?.total ?? 0;

                applications.push({
                    category: "defense",
                    type: game.i18n.localize(`PTU.Modifiers.ItemOverwrite.${stat}`),
                    adjustment: -1 * value
                })
                return value;
            }

            if (item?.system.category == "Physical") return this.system.stats.def.total;
            if (item?.system.category == "Special") return this.system.stats.spdef.total;
            return 0;
        })();
        const damageAbsorbedByDefense = currentDamage > 0 ? Math.min(currentDamage, defense) : 0;

        if (damageAbsorbedByDefense > 0 && !applications.some(a => a.category == "defense")) {
            applications.push({
                category: "defense",
                type: game.i18n.localize(`PTU.Modifiers.${item.system.category == "Special" ? "Special" : ""}Defense`),
                adjustment: -1 * damageAbsorbedByDefense
            })
        }

        const damageReduction = (() => {
            if (flatDamage) return 0;
            if (item?.system.category == "Physical") return this.system.modifiers.damageReduction.physical.total;
            if (item?.system.category == "Special") return this.system.modifiers.damageReduction.special.total;
            return 0;
        })();
        const damageAbsorbedByReduction = currentDamage > 0 ? Math.min(currentDamage - damageAbsorbedByDefense, damageReduction) : 0;

        if (damageAbsorbedByReduction > 0) {
            applications.push({
                category: "damage-reduction",
                type: game.i18n.localize("PTU.Modifiers.DamageReduction"),
                adjustment: -1 * damageReduction
            })
        }

        const { finalDamage, additionalApplications } = typeof damage === "number"
            ? skipIWR || flatDamage
                ? { finalDamage: currentDamage, additionalApplications: [] }
                : { finalDamage: Math.max((currentDamage - damageAbsorbedByDefense - damageAbsorbedByReduction), 1), additionalApplications: [] }
            : skipIWR || flatDamage
                ? { finalDamage: currentDamage, additionalApplications: [] }
                : this.applyIWR({ actor: this, damage: { ...damage, reduced: currentDamage - damageAbsorbedByDefense - damageAbsorbedByReduction }, item, effectiveness, rollOptions });

        applications.push(...additionalApplications);

        const hpUpdate = this.calculateHealthDelta(finalDamage <= 0 ? finalDamage : Math.max(1, finalDamage));
        const hpDamage = hpUpdate.totalApplied;

        const preUpdateSource = this.toObject();

        const { injuries, injuryStatements } = (() => {
            let injuries = 0;
            const injuryStatements = [];

            const { health, tempHp } = this.system;

            const massiveDamageGatePercentage = game.settings.get("ptu", "automation.massiveDamageThresholdPercent")
            const maxHpInjuryIntervalPercentage = game.settings.get("ptu", "automation.hpInjuryGateIntervalPercent")

            if (hpDamage >= Math.ceil(health.total * massiveDamageGatePercentage / 100)) {
                injuries++;
                injuryStatements.push(game.i18n.format("PTU.ApplyDamage.MassiveDamageInjury", { actor: this.link }));
            }
            if (this.system.boss?.is) {
                if (hpUpdate.updates["system.health.value"] <= 0) {
                    const { bars, turns } = this.system.boss;
                    const halfBars = Math.floor(turns / 2);
                    if (bars >= halfBars && (bars - 1) < halfBars) {
                        injuries++;
                        injuryStatements.push(game.i18n.format("PTU.ApplyDamage.BossHalfBarInjury", { actor: this.link }));
                    }
                }
            }
            else {
                // Every time a mon reaches a health threshhold, which is at 100% - maxHpInjuryIntervalPercentage, 100% - 2*maxHpInjuryIntervalPercentage, ...
                // one Injury should be added to the count.
                const currentPercentage = Math.ceil((health.value / health.total) * 100);
                const newPercentage = Math.ceil((((tempHp?.value ?? 0) + health.value - hpDamage) / health.total) * 100);

                for (let i = 100 - maxHpInjuryIntervalPercentage; true; i -= maxHpInjuryIntervalPercentage) {
                    if (i > currentPercentage) continue;

                    if (currentPercentage > i && i >= newPercentage) {
                        injuries++;
                        const percentageShortened = Math.floor(i * 1000) / 1000
                        injuryStatements.push(game.i18n.format("PTU.ApplyDamage.HpThresholdInjury", { actor: this.link, percentage: percentageShortened }));
                    }
                    else break;
                }
            }
            return { injuries, injuryStatements }
        })();

        // If injuries should be applied, add them to hpUpdates
        if (injuries > 0) {
            hpUpdate.updates["system.health.injuries"] = (isNaN(Number(preUpdateSource.system.health.injuries)) ? 0 : Number(preUpdateSource.system.health.injuries)) + injuries;
        }

        let bossStatement = null;
        // Do updates
        if (hpDamage !== 0 || hpUpdate.tempHpIncreased !== 0) {
            if (this.system.boss?.is && hpUpdate.updates["system.health.value"] <= 0) {
                const { bars } = this.system.boss;

                if (bars > 0) {
                    const newBars = Math.max(bars - 1, 0);
                    hpUpdate.updates["system.boss.bars"] = newBars;
                    hpUpdate.updates["system.health.value"] =
                        (injuries > this.system.health.injuries)
                            ? Math.trunc(this.system.health.total * (1 - ((this.system.modifiers.hardened ? Math.min(this.system.health.injuries, 5) : this.system.health.injuries) / 10)))
                            : this.system.health.max;
                    //TODO: Apply Injuries
                    await this.update(hpUpdate.updates);
                    bossStatement = game.i18n.format("PTU.ApplyDamage.BossBarBroken", { actor: this.link, bars: newBars });
                }
                else await this.update(hpUpdate.updates);
            }
            else await this.update(hpUpdate.updates);

            //TODO: Auto Fainting
        }

        // Construct & send chat message
        const hpStatement = (() => {
            if (hpDamage == 0) {
                if (hpUpdate.tempHpIncreased > 0) return null;
                return game.i18n.format("PTU.ApplyDamage.TakesNoDamage", { actor: this.link });
            }

            return hpDamage < 0 ? game.i18n.format("PTU.ApplyDamage.HealedForN", { actor: this.link, hpDamage: Math.abs(hpDamage) }) : game.i18n.format("PTU.ApplyDamage.DamagedForN", { actor: this.link, hpDamage });
        })();
        const tempHpStatement = hpUpdate.tempHpIncreased > 0
            ? game.i18n.format("PTU.ApplyDamage.GainedTempHp", { actor: this.link, hpDamage: hpUpdate.tempHpIncreased })
            : null;

        const statements = [hpStatement, tempHpStatement, bossStatement, ...injuryStatements].filter(s => s).join("<br>");
        const enrichedHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(statements, { async: true })
        const canUndoDamage = !!hpDamage

        const content = await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/damage-taken.hbs", {
            statements: enrichedHtml,
            iwr: {
                applications,
                visibility: this.hasPlayerOwner ? "all" : "gm"
            },
            canUndoDamage
        });

        const flavor = await (async () => {
            if (breakdown.length || notes.length) {
                return foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/damage-taken-flavor.hbs", { breakdown, notes });
            }
            return;
        })();

        const appliedDamage = canUndoDamage
            ? {
                uuid: this.uuid,
                isHealing: hpDamage < 0,
                updates: Object.entries(hpUpdate.updates)
                    .map(([path, newValue]) => {
                        const preUpdateValue = foundry.utils.getProperty(preUpdateSource, path);
                        if (typeof preUpdateValue === "number") {
                            const difference = preUpdateValue - newValue;
                            if (difference === 0) return [];
                            return {
                                path,
                                value: difference
                            }
                        }
                        return {
                            path,
                            value: preUpdateValue
                        }
                    }).flat(),
            }
            : null;

        await ChatMessagePTU.create({
            speaker: ChatMessagePTU.getSpeaker({ token }),
            flags: {
                ptu: {
                    appliedDamage
                }
            },
            flavor,
            content,
            type: CONST.CHAT_MESSAGE_STYLES.EMOTE,
            whisper: this.hasPlayerOwner ? [game.user.id] : game.users.filter(u => u.isGM).map(u => u.id),
        });

        return this;
    }

    async undoDamage(appliedDamage) {
        const { updates } = appliedDamage;

        const actorUpdates = {};
        for (const update of updates) {
            const currentValue = foundry.utils.getProperty(this, update.path);
            if (typeof currentValue === "number") {
                actorUpdates[update.path] = currentValue + Number(update.value);
            }
            else {
                actorUpdates[update.path] = update.value;
            }
        }

        if (Object.keys(actorUpdates).length > 0) {
            return this.update(actorUpdates);
        }
    }

    applyIWR({ actor, damage, item, effectiveness, rollOptions }) {
        if (actor.isDead) {
            return { finalDamage: 0, applications: [] };
        }

        const { total, totalCritImmune, reduced } = damage;

        const { immunities, weaknesses, resistances } = actor.iwr;

        const applications = (() => {
            const formalDescription = new Set([
                ...[
                    "damage",
                    `damage:type:${item.system.type?.toLocaleLowerCase(game.i18n.lang)}`,
                    `damage:category:${item.system.category?.toLocaleLowerCase(game.i18n.lang)}`,
                ].flat(),
                ...rollOptions
            ])

            // Step 1: Immunities
            const immunity = immunities.find(i => i.test(formalDescription))
            if (immunity) {
                return [{
                    category: "immunity",
                    type: immunity.label,
                    adjustment: -1 * reduced,
                }]
            }

            // Step 2: Crit immunities
            const critImmunity = immunities.find(i => i.type === "critical-hit");
            const isCrit = totalCritImmune < total;
            const critImmunityApplies = isCrit && !!critImmunity?.test([...formalDescription, "damage:component:critical"]);
            const critImmuneTotal = critImmunityApplies ? totalCritImmune : total;

            const applications = [];
            if (critImmunity && critImmuneTotal < total) {
                applications.push({
                    category: "immunity",
                    type: critImmunity.label,
                    adjustment: -1 * (reduced - critImmuneTotal),
                })
            }

            const afterImmunities = Math.max(reduced + applications.reduce((sum, a) => sum + a.adjustment, 0), 0);
            if (afterImmunities == 0) return applications;

            // Step 3: Weaknesses
            const mainWeaknesses = weaknesses.filter(w => w.test(formalDescription));
            const totalWeaknessMod = mainWeaknesses.reduce((sum, w) => sum * w.value, 1);
            const weaknessModifier = totalWeaknessMod > 2 ? Math.log2(totalWeaknessMod) : totalWeaknessMod == 2 ? 1.5 : totalWeaknessMod;

            const afterWeaknesses = afterImmunities * (weaknessModifier ?? 1);

            if (mainWeaknesses?.length > 0 && afterWeaknesses > afterImmunities) {
                for (const weakness of mainWeaknesses) {
                    applications.push({
                        category: "weakness",
                        type: weakness.label,
                        modifier: weakness.value > 2 ? Math.log2(weakness.value) : weakness.value == 2 ? 1.5 : weakness.value
                    })
                }
            }

            // Step 4: Resistances
            const mainResistances = resistances.filter(r => r.test(formalDescription));
            const totalResistanceMod = mainResistances.reduce((sum, r) => sum * r.value, 1);

            const afterResistances = afterImmunities * (totalResistanceMod ?? 1);

            if (mainResistances?.length > 0 && afterResistances < afterImmunities) {
                for (const resistance of mainResistances) {
                    applications.push({
                        category: "resistance",
                        type: resistance.label,
                        modifier: resistance.value
                    })
                }
            }

            // Step 5: Applicator Effectiveness
            if (effectiveness != 1) {
                applications.push({
                    category: "effectiveness",
                    type: game.i18n.format("PTU.Modifiers.Effectiveness", { effectiveness }),
                    modifier: effectiveness
                })
            }

            // Step 6: Combine
            const combinedModifier = totalWeaknessMod * totalResistanceMod * effectiveness;
            const realModifier = (combinedModifier > 2 ? Math.log2(combinedModifier) : combinedModifier == 2 ? 1.5 : combinedModifier) || 1;
            const finalDamage = Math.floor(afterImmunities * realModifier);

            if (finalDamage != afterImmunities) {
                applications.push({
                    category: "combined",
                    type: game.i18n.localize("PTU.Modifiers.Combined"),
                    adjustment: finalDamage - afterImmunities
                })
            }
            return applications;
        })();

        const adjustment = applications.filter(a => a.adjustment).reduce((sum, a) => sum + a.adjustment, 0);
        const finalDamage = (() => {
            if (applications.length === 1 && applications[0].category === "immunity" && applications[0].adjustment === -reduced) return 0;
            return Math.max(reduced + adjustment, 1);
        })();

        return { finalDamage, additionalApplications: applications };
    }

    calculateHealthDelta(damage) {
        const updates = {};
        const { health, tempHp } = this.system;

        const appliedToTempDecrease = (() => {
            if (!tempHp?.value || damage <= 0) return 0;
            const applied = Math.min(Number(tempHp.value), damage);
            updates["system.tempHp.value"] = Math.max(Number(tempHp.value) - applied, 0);

            return applied;
        })();

        const appliedToHP = (() => {
            const remainder = damage - appliedToTempDecrease;
            const applied = remainder > 0 ? remainder : Math.max(Number(health.value) - Number(health.max), remainder);
            updates["system.health.value"] = Number(health.value) - applied

            return applied;
        })();

        const appliedToTempIncrease = (() => {
            if (damage > 0) return 0;
            const remainder = Math.abs(damage - appliedToHP);
            if (Number(tempHp?.max ?? 0) < remainder) updates["system.tempHp.max"] = remainder;
            updates["system.tempHp.value"] = remainder;

            return remainder;
        })();

        return { updates, totalApplied: appliedToTempDecrease + appliedToHP, tempHpIncreased: appliedToTempIncrease };
    }

    /* -------------------------------------------- */
    /* Event Handlers                               */
    /* -------------------------------------------- */

    /** @override */
    _onUpdate(data, options, userId) {
        super._onUpdate(data, options, userId);

        if (data.system?.health?.value !== undefined) {
            if (data.system.health.value <= 0 && game.settings.get("ptu", "automation.autoFaint")) {
                if (this.primaryUpdater?.id !== game.user.id) return;
                const fainted = this.conditions.bySlug("fainted");
                if (fainted.length === 0) PTUCondition.FromEffects([{ id: "fainted" }]).then(items => this.createEmbeddedDocuments("Item", items));
            }
            else if (data.system.health.value > 0 && game.settings.get("ptu", "automation.autoFaintRecovery")) {
                if (this.primaryUpdater?.id !== game.user.id) return;
                const fainted = this.conditions.bySlug("fainted");
                if (fainted.length > 0) fainted.forEach(f => f.delete());
            }
        }

        if (game.combat && this.combatant) {
            this.#updateInitiative();
        }
    }

    /** @override */
    _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
        super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
        if (game.combat && this.combatant) this.#updateInitiative();
    }

    /** @override */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
        if (game.combat && this.combatant) this.#updateInitiative();
    }

    /** @override */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
        super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
        if (game.combat && this.combatant) this.#updateInitiative();
    }

    async #updateInitiative() {
        const initBase = Math.floor(this.combatant.initiative);
        /** @type {PTUDiceCheck} */
        const initiative = await this.initiative.prepareRoll();
        if (initBase === initiative.statistic.totalModifier) {
            this.debouncedUpdate();
        }
        else {
            const updates = [{ id: this.combatant.id, value: initiative.statistic.totalModifier + (this.combatant.initiative - initBase) }];
            if (this.combatant.isPrimaryBossCombatant) {
                const { otherTurns } = this.combatant.bossTurns;

                // For each other turn, add an initiative value that is 5 less than the previous
                // If the value is less than 0, instead start adding 5 more than the previous, restarting from 5 + base value
                for (let i = 1; i <= otherTurns.length; i++) {
                    const base = initiative.statistic.totalModifier + (this.combatant.initiative - initBase);
                    const init = base - (5 * i);
                    const actualInit = init >= 0 ? init : base + -5 * (Math.ceil(init / 5) - 1)
                    updates.push({ id: otherTurns[i - 1].id, value: actualInit });
                }
            }
            this.combatant.combat.setMultipleInitiatives(updates);
        }
    }

    debouncedUpdate = foundry.utils.debounce(() => {
        game.combat.setupTurns();
        if (ui.combat.viewed === game.combat) ui.combat.render();
    }, 50);

    /** @override */
    _onDelete(options, userId) {
        for (const effect of [this.itemTypes.effect, this.itemTypes.condition].flat()) {
            game.ptu.effectTracker.unregister(effect);
        }
        super._onDelete(options, userId);
    }

    /** @override */
    _onEmbeddedDocumentChange(embeddedName) {
        if (this.isToken) {
            return super._onEmbeddedDocumentChange(embeddedName);
        } else if (game.combat?.getCombatantByActor(this.id)) {
            // Needs to be done since `super._onEmbeddedDocumentChange` isn't called
            ui.combat.render();
        }

        // For linked tokens, replace parent method with alternative workflow to control canvas re-rendering
        const tokenDocs = this.getActiveTokens(true, true);
        for (const tokenDoc of tokenDocs) {
            tokenDoc.onActorEmbeddedItemChange();
        }
    }

    /* -------------------------------------------- */
    /* Moves                                        */
    /* -------------------------------------------- */

    prepareMoves({ includeStruggles = true } = {}) {
        const struggles = includeStruggles ? (() => {
            const types = Object.keys(CONFIG.PTU.data.typeEffectiveness)

            // Get the data common between all Struggles out of the way first
            const strugglePlusRollOptions = this.rollOptions.struggle ? Object.keys(this.rollOptions.struggle).filter(o => o.startsWith("skill:")) : [];
            const isStrugglePlus = (() => {
                for (const skill of strugglePlusRollOptions) {
                    if (this.system.skills?.[skill.replace("skill:", "")]?.value?.total > 4) return true;
                }
                return this.system.skills?.combat?.value?.total > 4;
            })();

            const constructStruggleItem = (type, category, range, ptuFlags, isRangedStruggle = false) => {
                return new Item.implementation({
                    name: `Struggle (${type})`,
                    type: "move",
                    img: CONFIG.PTU.data.typeEffectiveness[type].images.icon,
                    system: {
                        ac: isStrugglePlus ? 3 : 4,
                        damageBase: isStrugglePlus ? 5 : 4,
                        stab: false,
                        frequency: "At-Will",
                        isStruggle: true,
                        isRangedStruggle: isRangedStruggle,
                        category: category,
                        range: range,
                        type: type
                    },
                    flags: {
                        ptu: ptuFlags || {}
                    }
                },
                    {
                        parent: this,
                        temporary: true
                    }
                )
            }

            const struggles = types.reduce((arr, type) => {
                const localType = type.toLocaleLowerCase(game.i18n.lang);

                if (this.rollOptions.struggle?.[localType]) {
                    // If has <type>:ranged option
                    if (this.rollOptions.struggle?.[`${localType}:ranged`]) {
                        const typeRule = this.rules.find(r => !r.ignored && r.key == "RollOption" && r.domain == "struggle" && r.option == `${localType}:ranged`);
                        const ptuFlags = typeRule ? { grantedBy: { id: typeRule.item.id, onDelete: 'detach' } } : {};
                        arr.push(constructStruggleItem(type, "Physical", `6, 1 Target`, ptuFlags, true))
                        arr.push(constructStruggleItem(type, "Special", `6, 1 Target`, ptuFlags, true))
                        return arr;
                    }

                    const typeRule = this.rules.find(r => !r.ignored && r.key == "RollOption" && r.domain == "struggle" && r.option == localType);
                    const ptuFlags = typeRule ? { grantedBy: { id: typeRule.item.id, onDelete: 'detach' } } : {};

                    // Cover for telekinetic
                    const range = localType === "normal" ? `${this.system.skills?.focus?.value?.total ?? 1}` : "Melee"
                    arr.push(constructStruggleItem(type, "Physical", `${range}, 1 Target`, ptuFlags))
                    arr.push(constructStruggleItem(type, "Special", `${range}, 1 Target`, ptuFlags))
                    return arr;
                }

                if (localType === "normal") {
                    arr.push(constructStruggleItem(type, "Physical", "Melee, 1 Target"))
                }

                return arr;
            }, []);

            return struggles;
        })() : [];

        const moves = [];
        this.flags.ptu.disabledOptions = [];
        for (const move of this.itemTypes.move) {
            if (move.system.isStruggle) continue;

            this.flags.ptu.disabledOptions.push({
                "label": move.name,
                "value": move.slug,
                "sort": move.sort,
                "predicate": [{
                    "not": `condition:disabled:${move.slug}`
                }]
            });

            const clone = move.clone({}, { keepId: true });

            for (const rule of clone.prepareRuleElements()) {
                if (rule instanceof CONFIG.PTU.rule.elements.builtin.RollOption && !rule.ignored) {
                    rule.onApplyActiveEffects(true);
                }
            }

            moves.push(clone);
        }
        this.flags.ptu.disabledOptions.sort((a, b) => b.sort - a.sort);

        return new Collection(
            [...moves, ...struggles]
                .map(move => this.prepareAttack(move))
                .map(modifier => [modifier.item.id ?? modifier.item.realId, modifier])
        );
    }

    prepareAttack(move) {
        const attackRollOptions = move.getRollOptions("attack");
        const modifiers = [];

        const selectors = [
            `${move.id}-attack`,
            `${move.slug}-attack`,
            `${move.system.category.toLocaleLowerCase(game.i18n.lang)}-attack`,
            `${move.system.type.toLocaleLowerCase(game.i18n.lang)}-attack`,
            `${sluggify(move.system.frequency)}-attack`,
            "attack-roll",
            "attack",
            "all"
        ]
        if (move.system.isStruggle) selectors.push("struggle-attack");

        const rangeType = (() => {
            const range = move.system.range;
            if (range.includes("Melee")) return "melee";
            if (range.includes("Self")) return "self";
            return "ranged";

        })();
        if (rangeType) selectors.push(`${rangeType}-attack`);

        const rollOptions = [...this.getRollOptions(selectors), ...attackRollOptions];

        const statistic = new StatisticModifier(move.slug, modifiers)

        const action = foundry.utils.mergeObject(statistic, {
            label: move.name,
            img: move.img,
            domains: selectors,
            item: move,
            type: "move",
            category: move.system.category,
            options: move.system.options?.value ?? []
        });

        /** TODO: Add Attack Traits if we decide to add those */

        action.breakdown = action.modifiers
            .filter(m => m.enabled)
            .map(m => `${m.label}: ${m.signedValue}`)
            .join(", ");

        if (!move.rollable) return action

        action.roll = async (params = {}) => {
            const check = new PTUAttackCheck({
                source: {
                    actor: this,
                    item: move,
                    token: params.token ?? null,
                    options: rollOptions
                },
                targets: params.targets ?? [...game.user.targets],
                selectors,
                event: params.event,
            })

            return await check.executeAttack(params.callback, action);
        };

        action.damage = async (params = {}) => {
            const domains = selectors.map(s => s.replace("attack", "damage"));
            const accuracyRollResult = params.rollResult;

            const preTargets = params.targets?.length > 0 ? params.targets : [...game.user.targets];
            const targets = [];
            let outcomes = {};
            if (preTargets.length > 0 && !(preTargets[0] instanceof PTUActor)) {
                for (const target of preTargets) {
                    if (!target.token?.object) continue;
                    targets.push(target.token.object);
                    outcomes[target.token.actorId] = target.outcome;
                }
                if (targets.length == 0) {
                    targets.push(...game.user.targets);
                    outcomes = null;
                }
            }

            const check = new PTUDamageCheck({
                source: {
                    actor: this,
                    item: move,
                    token: params.token ?? null,
                    options: params.options ?? []
                },
                targets,
                outcomes,
                selectors: domains,
                event: params.event,
                accuracyRollResult
            })

            return await check.executeDamage(params.callback, action);

            const contexts = []

            const getContext = async (target) => {
                return await this.getCheckContext({
                    item: move,
                    domains: selectors,
                    statistic: action,
                    target: { token: target },
                    options: new Set([...rollOptions, ...params.options, ...action.options]),
                    viewOnly: params.getFormula ?? false
                });
            }

            for (const target of targets) {
                contexts.push(await getContext(target));
            }
            if (contexts.length == 0) contexts.push(await getContext(null));

            const { item, actor, token } = contexts[0].self;

            const damageContext = {
                type: "damage-roll",
                sourceType: "attack",
                actor,
                token,
                item,
                action,
                targets: contexts.map(c => ({ ...c.target, options: c.options })),
                outcomes,
                options: contexts.length > 1 ? contexts[0].options.filter(o => !o.startsWith("target")) : contexts[0].options,
                domains,
                ...eventToRollParams(params.event)
            }
            if (params.getFormula) damageContext.skipDialog = true;

            const damage = await PTUMoveDamage.calculate({
                move,
                actor: damageContext.actor,
                context: damageContext
            });
            if (!damage) return null;

            damageContext.domains = damage.domains;

            if (params.getFormula) {
                return damage;
            } else {
                return PTUDamage.roll(damage, damageContext, params.event, params.callback);
            }
        };

        return action;
    }

    prepareSkill(skill) {
        const selectors = [
            "all",
            "check",
            "skill-check",
            `skill-${skill}`
        ]

        const options = [...this.getRollOptions(selectors), `skill:${skill}`, `skill:${this.system.skills[skill].rank.toLocaleLowerCase(game.i18n.lang)}`];
        const statistic = new StatisticModifier(skill, []);

        const action = foundry.utils.mergeObject(statistic, {
            label: game.i18n.format("PTU.Check.SkillCheck", { skill: game.i18n.localize(`PTU.Skills.${skill}`) }),
            domains: selectors,
            type: "skill",
            options,
            skill
        });

        action.breakdown = () => action.modifiers
            .filter(m => m.enabled)
            .map(m => `${m.label}: ${m.signedValue}`)
            .join(", ");

        action.roll = async (params = {}) => {
            const check = new PTUSkillCheck({
                source: {
                    actor: this,
                    token: params.token ?? null,
                    options
                },
                targets: params.targets ?? [...game.user.targets],
                selectors,
                event: params.event,
                action,
                dc: params.dc ?? null
            })

            return await check.executeCheck(params.callback, action);
        }

        return action;
    }

    prepareInitiative() {
        const selectors = ["initiative", "all"];
        const options = this.getRollOptions(selectors);

        const statistic = new StatisticModifier("initiative", []);

        const action = foundry.utils.mergeObject(statistic, {
            label: game.i18n.localize("PTU.Check.Initiative"),
            domains: selectors,
            type: "initiative",
            options
        });

        action.breakdown = () => action.modifiers
            .filter(m => m.enabled)
            .map(m => `${m.label}: ${m.signedValue}`)
            .join(", ");

        action.prepareRoll = async (params = {}) => {
            const selfTokens = this.getActiveTokens(true, false)

            const check = new PTUDiceCheck(
                {
                    source: {
                        actor: this,
                        token: params.token ?? selfTokens,
                        options
                    },
                    targets: [],
                    selectors,
                    event: params.event,
                    rollCls: InitiativeRoll
                },
                action
            )
            await check.prepareContexts(action);

            check.prepareModifiers();
            check.modifiers = [
                new PTUModifier({
                    slug: "speed-stat",
                    label: "Speed Stat",
                    modifier: this.system.stats.spd.total
                }),
                ...check.modifiers,
            ]
            if (this.system.modifiers.initiative.total !== 0) {
                check.modifiers.push(new PTUModifier({
                    slug: "initiative-modifier",
                    label: "Initiative Modifier",
                    modifier: this.system.modifiers.initiative.total,
                }))
            }

            check.prepareStatistic("initiative")

            if (check.conditionOptions.has("condition:paralysis")) {
                check.statistic.push(new PTUModifier({
                    slug: "paralysis",
                    label: "Paralysis",
                    modifier: -Math.ceil(Math.abs(check.statistic.totalModifier * 0.5))
                }))
            }

            await check.beforeRoll()

            return check;
        }

        action.roll = async (params = {}) => {
            const combatant = await PTUCombatant.fromActor(this, false);
            if (!combatant) return;

            if (combatant.hidden) {
                params.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
            }

            /** @type {PTUDiceCheck} */
            const check = await action.prepareRoll(params);

            const result = await check.execute({
                diceSize: 20,
                rollModeArg: params.rollMode ?? null,
                isReroll: false,
                title: game.i18n.format("PTU.InitiativeRoll", { name: combatant.actor.name }),
                skipDialogArg: true,
                type: "initiative"
            });
            await check.afterRoll();

            if (!result) {
                // Render combat sidebar in case a combatant was created but the roll was not completed
                game.combats.render(false);
                return null;
            }

            // Update the tracker unless requested not to
            const updateTracker = params.updateTracker ?? true;
            if (updateTracker) {
                await combatant.combat.setInitiative(combatant.id, result.rolls.at(0).total);
            }

            return { combatant, roll: result.rolls.at(0) };
        }

        return action;
    }

    /* -------------------------------------------- */
    /* Rolls                                        */
    /* -------------------------------------------- */

    /**
     * @typedef {Object} TargetContext
     * @property {PTUActor} actor The actor that is the target of the check
     * @property {PTUTokenDocument} token The token that is the target of the check
     * @property {number} distance The distance between the origin and the target
     * @property {Set<string>} options Roll options for this check against this target
     * @property {boolean} viewOnly Whether this check is only for viewing the formula
     */

    /**
     * @returns {Promise<TargetContext>}
     */
    async getContext({ selfToken, targetToken, domains, selfItem, statistic, viewOnly = false }) {
        const selfOptions = this.getRollOptions(domains ?? []);

        const originalEphemeralEffects = await extractEphemeralEffects({
            affects: "origin",
            origin: this,
            target: targetToken?.actor ?? null,
            item: selfItem ?? null,
            domains,
            options: [...selfOptions, ...(selfItem?.getRollOptions("item") ?? [])]
        });

        const selfActor =
            viewOnly || !targetToken?.actor
                ? this
                : this.getContextualClone(
                    [...selfOptions, ...targetToken.actor.getSelfRollOptions("target")],
                    originalEphemeralEffects
                );

        const originItem = (() => {
            // 1. No clone, so use the item passed
            if (selfActor === this) return selfItem ?? null;

            // 2. Try get item from statistic
            if (
                statistic &&
                "item" in statistic &&
                statistic.item.type == "move"
            ) {
                return statistic.item;
            }

            // 3. Try get item from clone
            const itemClone = selfActor.items.get(selfItem?.id ?? "");
            if (itemClone) return itemClone;

            // 4. Give up :(
            return selfItem ?? null;
        })();

        const itemOptions = originItem?.getRollOptions("item") ?? [];

        const getTargetRollOptions = (actor) => {
            const targetOptions = actor?.getSelfRollOptions("target") ?? [];
            if (targetToken) {
                targetOptions.push("target");
                const mark = this.synthetics.targetMarks?.get(targetToken.document.uuid);
                if (mark) targetOptions.push(`target:mark:${mark}`);
            }
            targetOptions.push(...(actor?.getFilteredRollOptions("condition").map(o => `target:${o}`) ?? []));
            return targetOptions;
        }

        const targetRollOptions = getTargetRollOptions(targetToken?.actor ?? null);

        const options = {}
        if (itemOptions.includes("move:target:underground") && targetRollOptions.includes("target:location:underground")) {
            options["ignore-Z"] = true;
        }
        if (itemOptions.includes("move:target:underwater") && targetRollOptions.includes("target:location:underwater")) {
            options["ignore-Z"] = true;
        }
        if (itemOptions.includes("move:target:sky") && targetRollOptions.includes("target:location:sky")) {
            options["ignore+Z"] = true;
        }
        if (itemOptions.some(option => option.startsWith("move:range:burst"))) {
            options["burst"] = true;
        }

        const isFlanked = targetToken.isFlanked();
        if (isFlanked && !targetRollOptions.includes("target:immune:flanked")) {
            targetRollOptions.push("target:flanked");
        }

        const distance = selfToken && targetToken ? selfToken.distanceTo(targetToken, options) : null;
        const [originDistance, targetDistance] =
            typeof distance === "number"
                ? [`origin:distance:${distance}`, `target:distance:${distance}`]
                : [null, null];
        const rangeOptions = (() => {
            if (distance >= 4) return ["target:distance:4+"];
            return [];
        })();

        const targetEphemeralEffects = await extractEphemeralEffects({
            affects: "target",
            origin: selfActor,
            target: targetToken?.actor ?? null,
            item: selfItem,
            domains,
            options: [...selfOptions, ...itemOptions, ...targetRollOptions, ...rangeOptions]
        });

        const targetActor = (targetToken?.actor)?.getContextualClone(
            [
                ...selfActor.getSelfRollOptions("origin"),
                ...itemOptions,
                ...(originDistance ? [originDistance] : []),
                ...rangeOptions
            ],
            targetEphemeralEffects
        ) ?? null;

        const targetOptions = new Set([...(targetActor ? getTargetRollOptions(targetActor) : targetRollOptions), ...rangeOptions]);

        if (targetOptions.has("target:immune:flanked")) targetOptions.delete("target:flanked");
        else if (isFlanked) targetOptions.add("target:flanked");

        const rollOptions = new Set([
            ...selfOptions,
            ...itemOptions,
            ...targetOptions,
            ...(targetDistance ? [targetDistance] : []),
            ...rangeOptions
        ])

        return {
            options: rollOptions,
            actor: targetActor,
            token: targetToken.document,
            distance,
            targetOptions
        }
    }

    async getCheckContext(params) {
        const context = await this.getRollContext(params);
        const targetActor = context.target?.actor;

        const dcData = (() => {
            const move = context.self.item;
            const category = params.category ?? move?.system?.category;

            if (!category) return null;

            if (context.options.has("target:condition:vulnerable")) {
                return {
                    slug: "vulnerable",
                    value: 0,
                }
            }
            const stuck = (context.options.has("target:condition:stuck") && !context.options.has("target:types:ghost"));

            switch (category) {
                case "Status": return targetActor?.system?.evasion?.speed !== undefined ? {
                    slug: "speed-evasion",
                    value: stuck ? 0 : targetActor.system.evasion.speed,
                } : null;
                case "Physical": {
                    const { physical, speed } = targetActor?.system?.evasion ?? {};
                    if (physical === undefined || speed === undefined) return null;

                    return (stuck ? true : physical > speed) ? {
                        slug: "physical-evasion",
                        value: physical,
                    } : {
                        slug: "speed-evasion",
                        value: speed,
                    }
                }
                case "Special": {
                    const { special, speed } = targetActor?.system?.evasion ?? {};
                    if (special === undefined || speed === undefined) return null;

                    return (stuck ? true : special > speed) ? {
                        slug: "special-evasion",
                        value: special,
                    } : {
                        slug: "speed-evasion",
                        value: speed,
                    }
                }
            }
        })();

        return { ...context, dc: dcData }
    }

    async getRollContext(params) {
        const [selfToken, targetToken] =
            canvas.ready && !params.viewOnlyS
                ? [
                    canvas.tokens.controlled.find(t => t.actor === this) ?? this.getActiveTokens().shift() ?? null,
                    params.target?.token ?? params.target?.actor?.getActiveTokens().shift() ?? null
                ]
                : [null, null];

        const selfOptions = this.getRollOptions(params.domains ?? []);

        const originalEphemeralEffects = await extractEphemeralEffects({
            affects: "origin",
            origin: this,
            target: params.target?.actor ?? targetToken?.actor ?? null,
            item: params.item ?? null,
            domains: params.domains,
            options: [...params.options, ...(params.item?.getRollOptions("item") ?? [])]
        });

        const selfActor =
            params.viewOnly || !targetToken?.actor
                ? this
                : this.getContextualClone(
                    [...selfOptions, ...targetToken.actor.getSelfRollOptions("target")],
                    originalEphemeralEffects
                );

        const statistic = params.statistic;

        const selfItem = (() => {
            // 1. No clone, so use the item passed
            if (selfActor === this) return params.item ?? null;

            // 2. Try get item from statistic
            if (
                statistic &&
                "item" in statistic &&
                statistic.item.type == "move"
            ) {
                return statistic.item;
            }

            // 3. Try get item from clone
            const itemClone = selfActor.items.get(params.item?.id ?? "");
            if (itemClone?.type == "move") return itemClone;

            // 4. Give up :(
            return params.item ?? null;
        })();

        const itemOptions = selfItem?.getRollOptions("item") ?? [];

        const getTargetRollOptions = (actor) => {
            const targetOptions = actor?.getSelfRollOptions("target") ?? [];
            if (targetToken) {
                targetOptions.push("target");
                const mark = this.synthetics.targetMarks?.get(targetToken.document.uuid);
                if (mark) targetOptions.push(`target:mark:${mark}`);
            }
            targetOptions.push(...(actor?.getFilteredRollOptions("condition").map(o => `target:${o}`) ?? []));
            return targetOptions;
        }
        const targetRollOptions = getTargetRollOptions(targetToken?.actor);

        const options = {}
        if (itemOptions.includes("move:target:underground") && targetRollOptions.includes("target:location:underground")) {
            options["ignore-Z"] = true;
        }
        if (itemOptions.includes("move:target:underwater") && targetRollOptions.includes("target:location:underwater")) {
            options["ignore-Z"] = true;
        }
        if (itemOptions.includes("move:target:sky") && targetRollOptions.includes("target:location:sky")) {
            options["ignore+Z"] = true;
        }

        const distance = selfToken && targetToken ? selfToken.distanceTo(targetToken, options) : null;
        const [originDistance, targetDistance] =
            typeof distance === "number"
                ? [`origin:distance:${distance}`, `target:distance:${distance}`]
                : [null, null];
        const rangeOptions = (() => {
            if (distance >= 4) return ["target:distance:4+"];
            return [];
        })();

        const targetEphemeralEffects = await extractEphemeralEffects({
            affects: "target",
            origin: selfActor,
            target: targetToken?.actor ?? null,
            item: selfItem,
            domains: params.domains,
            options: [...params.options, ...itemOptions, ...targetRollOptions]
        });

        const targetActor = params.viewOnly
            ? null
            : (params.target?.actor ?? targetToken?.actor)?.getContextualClone(
                [
                    ...selfActor.getSelfRollOptions("origin"),
                    ...itemOptions,
                    ...(originDistance ? [originDistance] : []),
                    ...rangeOptions
                ],
                targetEphemeralEffects
            ) ?? null;

        const rollOptions = new Set([
            ...params.options,
            ...selfOptions,
            ...itemOptions,
            ...(targetActor ? getTargetRollOptions(targetActor) : targetRollOptions),
            ...rangeOptions
        ])
        if (targetDistance) rollOptions.add(targetDistance);

        const self = {
            actor: selfActor,
            token: selfToken?.document ?? null,
            statistic,
            item: selfItem,
            modifiers: []
        };

        const target =
            targetActor && targetToken && distance !== null
                ? { actor: targetActor, token: targetToken.document, distance }
                : null;

        return {
            options: rollOptions,
            self,
            target
        }
    }

    /* -------------------------------------------- */
    /* Conditions                                   */
    /* -------------------------------------------- */

    getCondition(slugOrKey, { all } = { all: false }) {
        const conditions = this.conditions.filter((c) => c.key === slugOrKey || c.slug === slugOrKey);

        if (all) {
            return conditions.sort((conditionA, conditionB) => {
                const [valueA, valueB] = [conditionA.value ?? 0, conditionB.value ?? 0];
                return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
            });
        } else {
            return conditions.find((c) => c.active) ?? null;
        }
    }

    hasCondition(...slugs) {
        return slugs.some(s => this.conditions.bySlug(s, { active: true }).length > 0);
    }

    async decreaseCondition(conditionOrSlug, { forceRemove } = { forceRemove: false }) {
        const condition = typeof conditionOrSlug === "string" ? this.getCondition(conditionOrSlug) : conditionOrSlug;
        if (!condition) return;

        const value = typeof condition.value === "number" ? Math.max(condition.value - 1, 0) : null;
        if (value !== null && !forceRemove && value !== 0) {
            return await condition.update({ "system.value.value": value })
        }
        return await this.deleteEmbeddedDocuments("Item", [condition.id])
    }
    async increaseCondition(conditionSlug, { min, max, value } = { max: Number.MAX_SAFE_INTEGER }) {
        if (value) min = max = value;

        const existing = (() => {
            if (typeof conditionSlug !== "string") return conditionSlug;

            const conditions = this.conditions.stored;
            return value
                ? conditions.find(c => c.slug === conditionSlug && !c.isLocked)
                : conditions.find(c => c.slug === conditionSlug && c.active);
        })();

        if (existing) {
            const conditionValue = (() => {
                if (existing.value === null) return null;
                if (min && max && min > max) throw new Error("Min cannot be greater than max.");
                return min && max
                    ? Math.clamp(existing.value + 1, min, max)
                    : max
                        ? Math.min(existing.value + 1, max)
                        : existing.value + 1;
            })();
            if (conditionValue === null || conditionValue > (max ?? 0)) return null;
            await existing.update({ "system.value.value": conditionValue });
            return existing;
        }
        return null;
    }

    // TODO: Check over
    /** @override */
    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        const token = this.getActiveTokens(true, true).shift();
        const health = this.system.health;



        const isDamage = !!(
            attribute === "health" &&
            health &&
            (isDelta || (value === 0 && token?.combatant))
        )
        if (isDamage && token) {
            const damage = isDelta ? -1 * value : hitPoints.value - value;
            return this.applyDamage({ damage, token, skipIWR: true });
        }
        return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    }

    _setDefaultChanges() {
        this.system.changes = foundry.utils.mergeObject(
            {
                system: {
                    levelUpPoints: {
                        1: {
                            source: "Base Value",
                            mode: "add",
                            value: this.type === "character" ? 9 : 10,
                        },
                        2: {
                            source: "Level",
                            mode: "add",
                            value: (
                                this.type === "character" && ["data-revamp", "short-track"].includes(game.settings.get("ptu", "variant.trainerAdvancement"))
                                    ? (this.system.level.current + this.system.level.current)
                                    : this.system.level.current),
                        },
                        3: {
                            source: "HP Stat",
                            mode: "add",
                            value: -this.system.stats.hp.levelUp,
                        },
                        4: {
                            source: "ATK Stat",
                            mode: "add",
                            value: -this.system.stats.atk.levelUp,
                        },
                        5: {
                            source: "DEF Stat",
                            mode: "add",
                            value: -this.system.stats.def.levelUp,
                        },
                        6: {
                            source: "SP.ATK Stat",
                            mode: "add",
                            value: -this.system.stats.spatk.levelUp,
                        },
                        7: {
                            source: "SP.DEF Stat",
                            mode: "add",
                            value: -this.system.stats.spdef.levelUp,
                        },
                        8: {
                            source: "SPD Stat",
                            mode: "add",
                            value: -this.system.stats.spd.levelUp,
                        },
                        9: {
                            source: "Stat Point Modifier",
                            mode: "add",
                            value: this.system.modifiers.statPoints.total,
                        },
                    },
                    evasion: {
                        physical: {
                            1: {
                                source: "DEF Stat / 5 (max 6)",
                                mode: "add",
                                value: Math.min(Math.floor(this.system.stats.def.total / 5), 6),
                            },
                            2: {
                                source: "Physical Evasion Mod",
                                mode: "add",
                                value: this.system.modifiers.evasion.physical.total
                            },
                        },
                        special: {
                            1: {
                                source: "SP.DEF Stat / 5 (max 6)",
                                mode: "add",
                                value: Math.min(Math.floor(this.system.stats.spdef.total / 5), 6),
                            },
                            2: {
                                source: "Special Evasion Mod",
                                mode: "add",
                                value: this.system.modifiers.evasion.special.total,
                            },
                        },
                        speed: {
                            1: {
                                source: "SPD Stat / 5 (max 6)",
                                mode: "add",
                                value: Math.min(Math.floor(this.system.stats.spd.total / 5), 6),
                            },
                            2: {
                                source: "Speed Evasion Mod",
                                mode: "add",
                                value: this.system.modifiers.evasion.speed.total,
                            },
                        },
                    },
                    skills:
                        this.system.modifiers.skillBonus.total > 0
                            ? Object.keys(this.system.skills)
                                .map((skill) => {
                                    return {
                                        [skill]: {
                                            modifier: {
                                                mod: {
                                                    1: {
                                                        source: "Skill Bonus",
                                                        mode: "add",
                                                        value: this.system.modifiers.skillBonus.total,
                                                    },
                                                },
                                            },
                                        },
                                    };
                                })
                                .reduce((map, obj) => {
                                    const skill = Object.keys(obj)[0];
                                    map[skill] = obj[skill];
                                    return map;
                                })
                            : undefined,
                },
            },
            this.system.changes
        );
    }
}

const PTUActorProxy = new Proxy(PTUActor, {
    construct(_target, args) {
        return new CONFIG.PTU.Actor.documentClasses[args[0].type](...args);
    }
})

export { PTUActor, PTUActorProxy };
