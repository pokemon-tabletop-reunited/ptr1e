import { CheckRoll } from "./roll.js";

class InitiativeRoll extends CheckRoll {
    constructor(formula, data, options) {
        // Remove modifierValue from options since the formula already includes the Speed modifier
        const { modifierValue, ...cleanOptions } = options;
        super(`${options.modifierPart} + 1d20 * 0.01`, data, {...cleanOptions, type: "initiative"});
    }
}

export { InitiativeRoll }