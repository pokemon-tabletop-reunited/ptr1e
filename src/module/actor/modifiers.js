import { sluggify } from "../../util/misc.js";
import { extractModifierAdjustments } from "../rules/helpers.js";
import { PTUPredicate } from "../system/predication.js";

// Add signedString method to Number prototype for Foundry VTT v13 compatibility
if (!Number.prototype.signedString) {
    Number.prototype.signedString = function() {
        if (this === 0) return "0";
        return this > 0 ? `+${this}` : `${this}`;
    };
}

/**
 * @typedef {Object} BaseRawModifier
 * @property {string?} slug An identifier for this modifier; should generally be a localization key (see en.json).
 * @property {string} label The display name of this modifier; can be a localization key (see en.json).
 * @property {number?} modifier The actual numeric benefit/penalty that this modifier provides.
 * @property {ModifierAdjustment[]?} adjustments A list of numeric adjustments to apply to this modifier. 
 * @property {boolean?} enabled If true, this modifier will be applied to the final roll; if false, it will be ignored.
 * @property {boolean?} ignored If true, these custom dice are being ignored in the damage calculation.
 * @property {string?} source The source from which this modifier originates, if any.
 * @property {PTUPredicate?} predicate A predicate that determines whether this modifier is active.
 * @property {boolean?} critical If true, this modifier will only be applied on a critical hit.
 * @property {string?} notes Any notes that should be displayed alongside this modifier.
 * @property {boolean?} hideIfDisabled If true, this modifier will be hidden if it is disabled. 
 */

/**
 * @typedef {Object} ModifierAdjustment
 * @property {string?} slug A slug for matching against modifiers: `null` will match against all modifiers within a selector
 * @property {PTUPredicate} predicate
 * @property {string?} relabel
 * @property {boolean?} suppress
 * @property {GetNewValue?} getNewValue
 */

/**
 * @callback GetNewValue
 * @param {number} current
 * @returns {number}
 */

/**
 * @typedef {Object} DeferredValueParams
 * @property {Record<string, unknown>?} resolvables An object to merge into roll data for `Roll.replaceFormulaData`
 * @property {Record<string, unknown>?} injectables An object to merge into standard options for `RuleElementPTU#resolveInjectedProperties`
 * @property {string[]? | Set<string>?} test Roll Options to get against a predicate (if available)
 */

/**
 * @callback DeferredValue<T>
 * @param {DeferredValueParams?} options
 * @returns {T | null}
 */

/**
 * @callback DeferredPromise<T>
 * @param {DeferredValueParams?} options
 * @returns {Promise<T | null>}
 */

/**
 * Represents a discrete modifier, bonus, or penalty, to a statistic or check.
 * @implements {BaseRawModifier}
 */
class PTUModifier {
    #originalValue;

    constructor({ label, slug, modifier, adjustments, enabled, ignored, source, predicate, hideIfDisabled, item, notes, critical } = {}) {
        this.label = game.i18n.localize(label);
        this.slug = sluggify(slug ?? label);
        
        this.#originalValue = this.modifier = modifier ?? 0;

        this.adjustments = foundry.utils.deepClone(adjustments ?? []);
        this.enabled = enabled ?? item?.enabled ?? true;
        this.ignored = ignored ?? false;
        this.source = source ?? null;
        this.predicate = new PTUPredicate(predicate ?? []);
        this.notes = notes ?? "";
        this.hideIfDisabled = hideIfDisabled ?? false;
        this.critical = critical ?? null;

        this.item = item ?? null;
        Object.defineProperty(this, "item", { enumerable: false });

        this.kind = (() => {
            if(this.modifier >= 0) return "bonus";
            if(this.modifier < 0) return "penalty";
            return "modifier";
        })();
    }

    get value() {
        return this.modifier;
    }

    get signedValue() {
        return this.modifier.signedString();
    }

    clone(options = {}) {
        const clone = 
            this.modifier === this.#originalValue
                ? new PTUModifier(this)
                : new PTUModifier({ ...this, modifier: this.#originalValue});
        
        if(options.test) clone.test(options.test);

        return clone;
    }

    getRollOptions() {
        const options = (["slug", "value"]).map((key) => `${this.kind}:${key}:${this[key]}`);

        if(this.item) {
            options.push(`${this.kind}:item:type:${this.item.type}`);
            options.push(`${this.kind}:item:slug:${this.item.slug}`);

            const grantingItem = this.item.grantedBy;
            if(grantingItem) {
                options.push(`${this.kind}:item:granter:type:${grantingItem.type}`);
                options.push(`${this.kind}:item:granter:slug:${grantingItem.slug}`);
            }
        }

        return new Set(options);
    }

    test(rollOptions) {
        this.ignored = !this.predicate.test(rollOptions);
    }

    toObject() {
        return foundry.utils.duplicate({...this, item: undefined});
    }

    toString() {
        return this.label;
    }
}

/**
 * Create a modifier for a given skill.
 * @param {Object} args
 * @param {PTUActor} args.actor
 * @param {string} args.skill
 * @param {string[]} args.domains 
 * @returns {PTUModifier} The modifier provided for the given skill.
 */
function createSkillModifier({actor, skill, domains}) {
    const withSkillBased = domains.includes(`${skill}-based`) ? domains : [...domains, `${skill}-based`];
    const {value, mod} = actor.system.skills[skill].modifier;
    return new PTUModifier({
        slug: skill,
        label: game.i18n.localize(`Skill.${skill}`),
        modifier: (isNaN(Number(value)) ? 0 : Number(value)) + (isNaN(Number(mod)) ? 0 : Number(mod)),
        adjustments: extractModifierAdjustments(actor.synthetics.modifierAdjustments, withSkillBased, skill),
    });
}

/**
 * Represents a statistic on an actor and its commonly applied modifiers. Each statistic or check can have multiple
 * modifiers. These modifiers are grouped by slug, and the total modifier is calculated by summing the modifiers
 * @class StatisticModifier 
 * @param {string} slug The slug of this collection of modifiers for a statistic.
 * @param {string} label The display label of this statistic
 * @param {PTUModifier[]} _modifiers The list of modifiers which affect the statistic.
 * @param {number} totalModifier The total modifier for this statistic.
 * @param {string} breakdown A textual breakdown of the modifiers affecting this statistic.
 * @param {any[]?} notes Optional notes that are often added to statistic modifiers.
 */
class StatisticModifier {
    /**
     * @param slug The name of this collection of statistic modifiers.
     * @param modifiers All relevant modifiers for this statistic.
     * @param rollOptions Roll options used for initial total calculation
     */
    constructor(slug, modifiers, rollOptions) {
        rollOptions = rollOptions instanceof Set ? rollOptions : new Set(rollOptions);
        this.slug = sluggify(slug);

        const seen = [];
        for (const modifier of modifiers) {
            const found = seen.some(m => m.slug === modifier.slug);
            if(!found) seen.push(modifier);
        }
        this._modifiers = seen;

        this.calculateTotal(rollOptions);
    }

    get modifiers() {
        return [...this._modifiers]
    }

    modifierBySlug(slug) {
        return this._modifiers.find(m => m.slug === slug);
    }

    push(modifier) {
        if(this._modifiers.find(m => m.slug === modifier.slug) === undefined) {
            this._modifiers.push(modifier);
            this.calculateTotal();
        }
        return this._modifiers.length;
    }

    unshift(modifier) {
        if(this._modifiers.find(m => m.slug === modifier.slug) === undefined) {
            this._modifiers.unshift(modifier);
            this.calculateTotal();
        }
        return this._modifiers.length;
    }

    delete(modifierOrSlug) {
        const toDelete = 
            typeof modifierOrSlug === "object"
                ? modifierOrSlug
                : this._modifiers.find(m => m.slug === modifierOrSlug);
        const wasDeleted =
            toDelete && this._modifiers.includes(toDelete)
                ? !!this._modifiers.findSplice((m) => m === toDelete)
                : false;
        if(wasDeleted) this.calculateTotal();

        return wasDeleted;
    } 

    calculateTotal(rollOptions = new Set()) {
        if(rollOptions.size > 0) {
            for(const modifier of this._modifiers) {
                modifier.test(rollOptions);
            }

            adjustModifiers(this._modifiers, rollOptions);
        }

        for(const modifier of this._modifiers) {
            if (modifier.ignored) {
                modifier.enabled = false;
                continue;
            }
            modifier.enabled = true;
        }

        this.totalModifier = this._modifiers.filter(m => m.enabled).reduce((total, m) => total + m.modifier, 0);
    }
}

function adjustModifiers(modifiers, rollOptions) {
    for(const modifier of [...modifiers].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))) {
        const adjustments = modifier.adjustments.filter(a => a.predicate.test([...rollOptions, ...modifier.getRollOptions()]));

        if(adjustments.some((a) => a.suppress)) {
            modifier.ignored = true;
            continue;
        }

        const resolvedAdjustment = adjustments.reduce(
            (resolved, adjustment) => {
                const newValue = adjustment.getNewValue?.(resolved.value) ?? resolved.value;
                if(newValue !== resolved.value) {
                    resolved.value = newValue;
                    resolved.relabel = adjustment.relabel ?? null;
                }
                return resolved;
            },
            { value: modifier.modifier, relabel: null}
        );

        modifier.modifier = resolvedAdjustment.value;

        if(resolvedAdjustment.relabel) {
            modifier.label = game.i18n.localize(resolvedAdjustment.relabel);
        }
    }
}

/**
 * Represents the list of modifiers for a specific check
 */
class CheckModifier extends StatisticModifier {
    constructor(slug, statistic, modifiers, rollOptions) {
        super(slug, statistic.modifiers.map(m => m.clone()).concat(modifiers), rollOptions);
    }

    /**
     * @returns {StatisticModifier} 
     */
    static create({slug, modifiers, rollOptions, statistic}) {
        const mods = [...modifiers, ...(statistic?.modifiers?.map(m => m.clone()) ?? [])]
        return new StatisticModifier(slug, mods, rollOptions);
    }
}

/**
 * Represents extra dice that are added to a roll.
 * @class PTUDiceModifier
 * @implements {BaseRawModifier}
 */
class PTUDiceModifier {
    constructor({label, slug, diceNumber, dieSize, critical, override, predicate, enabled, ignored, selector}) {
        
        this.label = game.i18n.localize(label ?? "");
        this.slug = sluggify(slug ?? label);
        if(!this.slug) throw new Error("A dice modifier must have a slug.");
        
        this.diceNumber = diceNumber ?? 0;
        this.kind = this.diceNumber >= 0 ? "bonus" : "penalty";
        this.dieSize = dieSize ?? null;
        this.critical = critical ?? null;
        this.override = override ?? null;
        this.predicate = predicate instanceof PTUPredicate ? predicate : new PTUPredicate(predicate ?? []);
        this.enabled = enabled ?? this.predicate.test([]);
        this.ignored = ignored ?? !this.enabled;
        this.selector = selector;
    }

    clone() {
        return new PTUDiceModifier(this);
    }

    get value() {
        return `${this.diceNumber}d${this.dieSize}`;
    }

    get signedValue() {
        return `${this.kind === "bonus" ? "+" : ""}${this.value}`;
    }

    getRollOptions() {
        const options = (["slug", "value", "diceNumber", "dieSize"]).map((key) => `dice:${key}:${this[key]}`);

        if(this.critical) options.push(`dice:critical`);

        return new Set(options);
    }

    test(rollOptions) {
        this.ignored = !this.predicate.test(rollOptions);
    }

    toObject() {
        return foundry.utils.duplicate({...this});
    }

    toString() {
        return this.label;
    }
}

/**
 * Represents a statistic on an actor and its commonly applied modifiers. Each statistic or check can have multiple
 * modifiers. These modifiers are grouped by slug, and the total modifier is calculated by summing the modifiers
 * @class StatisticModifier 
 * @param {string} slug The slug of this collection of modifiers for a statistic.
 * @param {string} label The display label of this statistic
 * @param {PTUDiceModifier[]} _modifiers The list of modifiers which affect the statistic.
 * @param {string} totalModifier The total modifier for this statistic.
 * @param {number} expectedTotal The expected total for this statistic.
 * @param {string} breakdown A textual breakdown of the modifiers affecting this statistic.
 * @param {any[]?} notes Optional notes that are often added to statistic modifiers.
 */
class StatisticDiceModifier {
    /**
     * @param slug The name of this collection of statistic modifiers.
     * @param modifiers All relevant modifiers for this statistic.
     * @param rollOptions Roll options used for initial total calculation
     */
    constructor(slug, modifiers, rollOptions) {
        rollOptions = rollOptions instanceof Set ? rollOptions : new Set(rollOptions);
        this.slug = sluggify(slug);

        const seen = [];
        for (const modifier of modifiers) {
            const found = seen.some(m => m.slug === modifier.slug);
            if(!found) seen.push(modifier);
        }
        this._modifiers = seen;

        this.calculateTotal(rollOptions);
    }

    get modifiers() {
        return [...this._modifiers]
    }

    get label() {
        const allLabelsAreEqual = this._modifiers.every((obj, _, arr) => obj.label === arr[0].label);
        if(allLabelsAreEqual) return this._modifiers[0].label;
        return game.i18n.localize(this.slug);
    }

    get tags() {
        // const allLabelsAreEqual = this._modifiers.every((obj, _, arr) => obj.label === arr[0].label);
        // if(allLabelsAreEqual) return [`${this.label}: ${this.totalModifier}`];

        return this._modifiers.map(m => `${m.label} ${m.signedValue}`);
    }

    push(modifier) {
        if(this._modifiers.find(m => m.slug === modifier.slug) === undefined) {
            this._modifiers.push(modifier);
            this.calculateTotal();
        }
        return this._modifiers.length;
    }

    unshift(modifier) {
        if(this._modifiers.find(m => m.slug === modifier.slug) === undefined) {
            this._modifiers.unshift(modifier);
            this.calculateTotal();
        }
        return this._modifiers.length;
    }

    delete(modifierOrSlug) {
        const toDelete = 
            typeof modifierOrSlug === "object"
                ? modifierOrSlug
                : this._modifiers.find(m => m.slug === modifierOrSlug);
        const wasDeleted =
            toDelete && this._modifiers.includes(toDelete)
                ? !!this._modifiers.findSplice((m) => m === toDelete)
                : false;
        if(wasDeleted) this.calculateTotal();

        return wasDeleted;
    } 

    calculateTotal(rollOptions = new Set()) {
        if(rollOptions.size > 0) {
            for(const modifier of this._modifiers) {
                modifier.test(rollOptions);
            }
        }

        for(const modifier of this._modifiers) {
            if (modifier.ignored) {
                modifier.enabled = false;
                continue;
            }
            modifier.enabled = true;
        }

        const terms = this._modifiers.filter(m => m.enabled)
            .reduce((total, mod) => {
                total[mod.dieSize] = { 
                    dieSize: mod.dieSize,
                    diceNumber: (total[mod.dieSize]?.diceNumber ?? 0) + mod.diceNumber
                }
                return total;
            }, [])
            .flatMap(mod => ({...mod, string: `${mod.diceNumber}d${mod.dieSize}`}));

        this.totalModifier = terms.map(t => t.string).join(" + ");
        this.expectedTotal = terms.reduce((total, t) => total + (Math.ceil((t.dieSize + 1) / 2) * t.diceNumber), 0);
    }
}

export { StatisticModifier, PTUModifier, CheckModifier, PTUDiceModifier, createSkillModifier, StatisticDiceModifier }

// globalThis.PTUModifier = PTUModifier;
// globalThis.StatisticModifier = StatisticModifier;
// globalThis.CheckModifier = CheckModifier;
// globalThis.PTUDiceModifier = PTUDiceModifier;
// globalThis.PTUDamageDice = PTUDamageDice;
// globalThis.createSkillModifier = createSkillModifier;