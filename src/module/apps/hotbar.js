class PTUHotBar extends foundry.applications.ui.Hotbar {
    /** @override */
    async _onDrop(event) {
        event.preventDefault();
        const li = event.target.closest(".macro");
        const slot = Number(li.dataset.slot);
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (Hooks.call("hotbarDrop", this, data, slot) === false) return;

        // Forbid overwriting macros if the hotbar is locked.
        const existingMacro = game.macros.get(game.user.hotbar[slot]);
        if (existingMacro && this.locked) return ui.notifications.warn("MACRO.CannotOverwrite", { localize: true });

        // Get the dropped document
        const cls = getDocumentClass(data.type);
        const doc = await cls?.fromDropData(data);
        if (!doc) return;

        // Get the Macro to add to the bar
        const macro = await (async () => {
            switch(data.type) {
                case "Macro": return game.macros.has(doc.id) ? doc : await cls.create(doc.toObject());
                case "RollTable": return await this._createRollTableRollMacro(doc);
                case "Item": {
                    const item = await fromUuid(data.uuid);
                    if (!item) return;

                    if (item.type === "effect" || item.type === "condition") {
                        const command = `const item = await fromUuid("${data.uuid}");await item?.apply?.(game.user.targets.size > 0 ? [...game.user.targets] : (canvas.tokens.controlled ?? []), "${data.uuid}")`;
                        let macro = game.macros.find(m => m.name === `Apply: ${item.name}` && m.command === command);
                        if (!macro) {
                            macro = await Macro.create({
                                name: `Apply: ${item.name}`,
                                type: "script",
                                command: command,
                                img: item.img,
                                flags: { "ptu.itemMacro": true }
                            });
                        }
                        return macro;
                    }
                }
                default: return await this._createDocumentSheetToggle(doc);
            }
        })();

        // Assign the macro to the hotbar
        if (!macro) return;
        return game.user.assignHotbarMacro(macro, slot, { fromSlot: data.slot });
    }
}

export { PTUHotBar }