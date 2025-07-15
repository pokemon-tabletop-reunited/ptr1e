function registerSheets() {
    // Register sheet application classes
    Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
    Actors.registerSheet("ptu", CONFIG.PTU.Actor.sheetClasses.character, { types: ["character"], makeDefault: true });
    Actors.registerSheet("ptu", CONFIG.PTU.Actor.sheetClasses.pokemon, { types: ["pokemon"], makeDefault: true });
    Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.item, { types: ["item", "ability", "capability", "pokeedge", "dexentry", "condition", "reference", "spiritaction"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.move, { types: ["move"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.contestmove, { types: ["contestmove"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.edge, { types: ["edge"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.feat, { types: ["feat"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.effect, { types: ["effect"], makeDefault: true });
    Items.registerSheet("ptu", CONFIG.PTU.Item.sheetClasses.species, { types: ["species"], makeDefault: true });

    DocumentSheetConfig.registerSheet(JournalEntry, "ptu", CONFIG.PTU.Journal.Rulebook.journalClass, {
        types: ["base"],
        label: "PTU.RulebookJournalSheetName",
        makeDefault: false
      });

    DocumentSheetConfig.registerSheet(CONFIG.PTU.Token.documentClass, "ptu", CONFIG.PTU.Token.sheetClass, { makeDefault: true });
}

export { registerSheets }