/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {FormApplication}
 */
 export class PTUCombatTrackerConfig extends foundry.applications.apps.CombatTrackerConfig {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/ptu/static/templates/config/combat-settings.hbs",
      title: "PTU Combat Settings"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    game.settings.set("core", "combatTheme", formData.combatTheme);
    if ( !game.user.isGM ) return;
    return game.settings.set("core", Combat.CONFIG_SETTING, {
      resource: formData.resource,
      skipDefeated: formData.skipDefeated,
      leagueBattle: formData.leagueBattle,
    });
  }
}
