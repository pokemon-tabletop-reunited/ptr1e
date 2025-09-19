export function registerTemplates() {
    return foundry.applications.handlebars.loadTemplates([

        // Actor Sheet Partials
        // "systems/ptu/templates/partials/active-effects.hbs",
        "systems/ptu/static/templates/partials/mod-field.hbs",
        "systems/ptu/static/templates/partials/item-display-partial.hbs",

        // Item Sheet Partials
        "systems/ptu/static/templates/partials/rules/rule-partial.hbs",
        "systems/ptu/static/templates/partials/species-item-partial.hbs",

        // Token Sheet partials
        "systems/ptu/static/templates/config/token/appearance-partial.hbs",
        "systems/ptu/static/templates/config/token/identity-partial.hbs",

        "systems/ptu/static/templates/apps/compendium-browser/filters.hbs",
        "systems/ptu/static/templates/apps/compendium-browser/browser-settings.hbs",

        // Charactermancer Partials
        // "systems/ptu/templates/partials/charactermancer-evolution-partial.hbs",
        // "/systems/ptu/templates/partials/charactermancer/stat-block-partial.hbs"
    ]);
};