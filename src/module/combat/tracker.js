import { PTUCombatant } from "./combatant.js";

class PTUCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "systems/ptu/static/templates/sidebar/combat-tracker.hbs",
        });
    }

    /** @override */
    async getData(options={}) {
        const data = await super.getData(options);
        data.turns = data.turns.map(t => {
            const turn = {...t};
            const combatant = this.viewed?.combatants.get(turn.id); 
            if(combatant) {
                turn.hasActed = combatant.hasActed;
            }
            return turn;
        });
        data.expBudget = data.combat?.expBudget;
        return data;
    }

    /** 
     * @override 
     * @param {PointerEvent} event
    */
    async _onCombatantControl(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Find the actual button that was clicked
        // Note: Foundry v13 converts data-control to data-action in rendered HTML
        const btn = event.target.closest("[data-action]");
        
        // Find the combatant list item
        const li = btn.closest(".combatant");
        
        const combat = this.viewed;
        /** @type {PTUCombatant} */
        const c = combat.combatants.get(li.dataset.combatantId);
        
        // Switch control action (using data-action since Foundry v13 converts data-control)
        switch (btn.dataset.action) {

            // Toggle combatant visibility
            case "toggleHidden":
                return c.toggleVisibility();

            // Toggle combatant defeated flag
            case "toggleDefeated":
                return this._onToggleDefeatedStatus(c);

            // Roll combatant initiative
            case "rollInitiative":
                return combat.rollInitiative([c.id]);

            // Actively ping the Combatant
            case "pingCombatant":
                return this._onPingCombatant(c);

            // Toggle acted state for the combatant
            case "toggleActed":
                return c.toggleActed({multi: event.shiftKey});
        }
    }

    /** @override */
    async _onToggleDefeatedStatus(combatant) {
        return combatant.toggleDefeated();
    }
}
export { PTUCombatTracker }