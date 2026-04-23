import { sluggify } from "../../../util/misc.js";
import { PTUModifier } from "../../actor/modifiers.js";
import { ResolvableValueField } from "../../system/schema-data-fields.js";
import { RuleElementPTU } from "./base.js";

class FlatModifierRuleElement extends RuleElementPTU {
    constructor(source, item, options) {
        super(source, item, options);
    }

    /** @override */
    static defineSchema() {
        const { fields } = foundry.data;

        return {
            ...super.defineSchema(),
            selectors: new fields.ArrayField(
                new fields.StringField({ required: true, blank: false, initial: undefined }),
            ),
            min: new fields.NumberField({ required: false, nullable: false, initial: undefined }),
            max: new fields.NumberField({ required: false, nullable: false, initial: undefined }),
            force: new fields.BooleanField(),
            hideIfDisabled: new fields.BooleanField({ required: false, initial: true }),
            value: new ResolvableValueField({ required: false, nullable: false, initial: undefined })
        };
    }

    /** @override */
    beforePrepareData() {
        if (this.ignored) return;

        const slug = this.slug ?? sluggify(this.reducedLabel);

        const selectors = this.selectors.map(s => this.resolveInjectedProperties(s)).filter(s => !!s);
        if (selectors.length === 0) {
            return this.failValidation("must have at least one selector");
        }

        for (const selector of selectors) {
            const construct = (options = {}) => {
                options = { ...options };
                options.injectables = {
                    ...options.injectables,
                    item: this.item,
                }
                const finalValue = (() => {
                    if (selector.includes("damage-dice")) {
                        options.evaluate = false;
                        return this.resolveValue(this.value, "", options);
                    }
                    const resolvedValue = Number(this.resolveValue(this.value, 0, options)) || 0;
                    const finalValue = Math.clamp(resolvedValue, this.min ?? resolvedValue, this.max ?? resolvedValue);
                    return finalValue;
                })();

                const modifier = new PTUModifier({
                    slug,
                    label: this.reducedLabel,
                    modifier: finalValue,
                    predicate: this.resolveInjectedProperties(this.predicate, options.injectables),
                    item: this.item,
                    force: this.force,
                    source: this.item.uuid,
                    hideIfDisabled: this.hideIfDisabled
                })
                if (options.test) modifier.test(options.test);
                return modifier;
            }

            const modifiers = (this.actor.synthetics.statisticsModifiers[selector] ??= []);
            modifiers.push(construct);
        }
    }
}

export { FlatModifierRuleElement }