import { PTUCombatant } from "./combatant.js";

class PTUCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        actions: {
            ...super.DEFAULT_OPTIONS.actions,
            toggleActed: PTUCombatTracker.#onCombatantControl,
        }
    };

    /** @override */
    static PARTS = {
        header: {
            template: "systems/ptu/static/templates/sidebar/combat-tracker/header.hbs",
        },
        tracker: {
            template: "systems/ptu/static/templates/sidebar/combat-tracker/tracker.hbs",
        },
        footer: super.PARTS.footer,
    }

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        switch ( partId ) {
        case "header": await this._prepareHeaderContext(context, options); break;
        }
        return context;
    }

    /**
     * Prepares the context for the header part of the combat tracker.
     * @param {*} context 
     * @param {*} options 
     * @returns 
     */
    async _prepareHeaderContext(context, options) {
        context.expBudget = context.combat?.expBudget;
        return context;
    }

    /** @override */
    async _prepareTurnContext(combat, combatant, index) {
        const turn = await super._prepareTurnContext(combat, combatant, index);
        turn.hasActed = combatant?.hasActed ?? false;
        return turn;
    }

    /**
     * Handle performing some action for an individual combatant.
     * @this {CombatTracker}
     * @param {...any} args
     */
    static #onCombatantControl(...args) {
        return this._onCombatantControl(...args);
    }


    /** 
     * @override 
     * @param {PointerEvent} event
    */
    async _onCombatantControl(event, target) {
        const { combatantId } = target.closest("[data-combatant-id]")?.dataset ?? {};
        const combat = this.viewed;
        const combatant = combat?.combatants.get(combatantId);
        if ( !combatant ) return;
        
        switch (target.dataset.action) {
            case "toggleHidden": return combatant.toggleVisibility();
            case "toggleDefeated": return this._onToggleDefeatedStatus(combatant);
            case "rollInitiative": return combat.rollInitiative([combatant]);
            case "pingCombatant": return this._onPingCombatant(combatant);
            case "toggleActed": return combatant.toggleActed({multi: event.shiftKey});
        }
    }

    /** @override */
    async _onToggleDefeatedStatus(combatant) {
        return combatant.toggleDefeated();
    }
}
export { PTUCombatTracker }