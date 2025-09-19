function registerSheets() {
    // Register sheet application classes
    foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
    foundry.documents.collections.Actors.registerSheet("ptu", CONFIG.PTU.Actor.sheetClasses.character, { types: ["character"], makeDefault: true });
    foundry.documents.collections.Actors.registerSheet("ptu", CONFIG.PTU.Actor.sheetClasses.pokemon, { types: ["pokemon"], makeDefault: true });
    foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.item, { types: ["item", "ability", "capability", "pokeedge", "dexentry", "condition", "reference", "spiritaction"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.move, { types: ["move"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.contestmove, { types: ["contestmove"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.edge, { types: ["edge"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.feat, { types: ["feat"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.effect, { types: ["effect"], makeDefault: true });
    foundry.documents.collections.Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.species, { types: ["species"], makeDefault: true });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "ptu", CONFIG.PTU.Journal.Rulebook.journalClass, {
        types: ["base"],
        label: "PTU.RulebookJournalSheetName",
        makeDefault: false
      });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(CONFIG.PTU.Token.documentClass, "ptu", CONFIG.PTU.Token.sheetClass, { makeDefault: true });
}

export { registerSheets }