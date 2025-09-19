import { ActorConfig } from "./sheet/actor-config.js";

class PTUActorSheet extends foundry.appv1.sheets.ActorSheet {
    /** @override */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        const sheetButton = buttons.find((button) => button.class === "configure-sheet");
        const hasMultipleSheets = Object.keys(CONFIG.Actor.sheetClasses[this.actor.type]).length > 1;
        if (!hasMultipleSheets && sheetButton) {
            buttons.splice(buttons.indexOf(sheetButton), 1);
        }

        if (this.isEditable) {
            const index = buttons.findIndex((b) => b.class === "close");
            buttons.splice(index, 0, {
                label: "Configure", // Top-level foundry localization key
                class: "configure-creature",
                icon: "fas fa-cog",
                onclick: () => this._onConfigureActor(),
            });

            // Add a button to heal the character as if Pokecenter Healing was done
            buttons.unshift({
                label: "Heal",
                class: "heal-character",
                icon: "fas fa-heart",
                onclick: async () => {
                    const hp = this.actor.system.health.value;
                    const maxHp = this.actor.system.health.max;
                    const totalHp = this.actor.system.health.total;
                    const injuries = this.actor.system.health.injuries;
                    if(injuries === 0 && hp === maxHp) return ui.notifications.info(`${this.actor.name} is already at full health!`);
                    if(injuries <= 3) {
                        await this.actor.update({
                            "system.health.value": totalHp,
                            "system.health.injuries": 0
                        });
                        await ChatMessage.create({
                            speaker: {alias: this.actor.name},
                            content: `${this.actor.name} was healed to full health! (${hp} -> ${totalHp}) and healed ${injuries} injuries! (${injuries} -> 0)`
                        })
                    } 
                    else {
                        await this.actor.update({
                            "system.health.injuries": Math.max(0, injuries - 3)
                        })

                        const newMax = this.actor.system.health.max;
                        await this.actor.update({
                            "system.health.value": newMax
                        });
                        await ChatMessage.create({
                            speaker: {alias: this.actor.name},
                            content: `${this.actor.name} was healed to full health! (${hp} -> ${newMax}) and healed 3 injuries! (${injuries} -> ${Math.max(0, injuries - 3)})`
                        })
                    }
                }
            })
        }

        // Add notes button
        buttons.unshift({
            label: "Notes",
            class: "open-notes",
            icon: "fas fa-book",
            onclick: () => this.openNotes(),
        })

        return buttons;
    }

    _onConfigureActor() {
        new ActorConfig(this.actor).render(true);
    }

    
	/** @override */
	async getData() {
		const data = await super.getData();
		data.config = CONFIG.PTU.data;
        return data;
    }

    /** Emulate a sheet item drop from the canvas */
    async emulateItemDrop(data) {
        return this._onDropItem({ preventDefault: () => { } }, data);
    }

    async openNotes() {
        const folder = await (async () => {
            const folderId = game.settings.get("ptu", "worldNotesFolder");
            if (!folderId) {
                if (game.user.isGM) return game.ptu.macros.initializeWorldNotes();
                else return null;
            }

            const folder = game.folders.get(folderId);
            if (!folder) {
                if (game.user.isGM) return game.ptu.macros.initializeWorldNotes();
                else return null;
            }

            return folder;
        })();
        if (!folder) return ui.notifications.error("No folder found for world notes; Please ask your GM to login and not to delete the folder \"Actor Notes\"");

        const journalEntry = await (async () => {
            const journalId = this.actor.getFlag("ptu", "notesId");
            if (!journalId) {
                const journal = await JournalEntry.create({
                    name: this.actor.name,
                    folder: folder.id,
                    ownership: this.actor.ownership,
                    pages: [
                        {
                            name: "Notes",
                            type: "text",
                            ownership: this.actor.ownership,
                            text: {
                                format: 1,
                                content: this.actor.system.notes || ""
                            }
                        }
                    ]
                });
                await this.actor.setFlag("ptu", "notesId", journal.id);
                return journal;
            }

            const journal = await fromUuid(`JournalEntry.${journalId}`);
            if (!journal) {
                await this.actor.unsetFlag("ptu", "notesId");
                return this.openNotes();
            }

            return journal;
        })();
        if (!journalEntry) return;

        journalEntry.sheet.render(true);
    }

    /** @override */
    async _onDrop(event) {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        const actor = this.actor;
        const allowed = Hooks.call("dropActorSheetData", actor, this, data);
        if (allowed === false) return;

        // Case 1 - Money
        if (data.type === "pokedollar") {
            const amount = parseInt(data.data.amount);
            if (!amount) return ui.notifications.error("Invalid amount of money dropped");

            if (data.data.item) {
                const item = await fromUuid(data.data.item);
                if (!item) return ui.notifications.error("Invalid item dropped");

                if ((actor.system.money ?? 0) < amount) return ui.notifications.error(`${actor.name} does not have enough money to pay for ${item.name} (Cost: ${amount} Poké, Current: ${actor.system.money})`);
                await actor.update({
                    "system.money": actor.system.money - amount,
                });
                // If duplicate item gets added instead increase the quantity
                const existingItem = actor.items.getName(item.name);
                if (existingItem && existingItem.system.quantity) {
                    const quantity = foundry.utils.duplicate(existingItem.system.quantity);
                    await existingItem.update({ "system.quantity": Number(quantity) + (item.system.quantity > 0 ? Number(item.system.quantity) : 1) });
                }
                else {
                    await Item.create(item.toObject(), { parent: actor });
                }
                return ui.notifications.info(`${actor.name} Paid ${amount} Poké for ${item.name} (New Total: ${actor.system.money})`);
            }
            await actor.update({
                "system.money": actor.system.money + amount
            });
            return ui.notifications.info(`${actor.name} Gained ${amount} Poké (New Total: ${actor.system.money})`);
        }
        // Case 2 - Items (including effects and conditions)
        else if (data.type === "Item" && data.uuid) {
            const item = await fromUuid(data.uuid);
            if (!item) return ui.notifications.error("Invalid item dropped");

            // Special handling for effects and conditions
            if (item.type === "effect" || item.type === "condition") {
                try {
                    // Check if the item has an apply method (for effects/conditions)
                    if (typeof item.apply === "function") {
                        await item.apply([actor]);
                        return ui.notifications.info(`Applied ${item.name} to ${actor.name}`);
                    } else {
                        // Fallback: create the item on the actor
                        await actor.createEmbeddedDocuments("Item", [item.toObject()]);
                        return ui.notifications.info(`Added ${item.name} to ${actor.name}`);
                    }
                } catch (error) {
                    console.error("PTU | Error applying effect/condition:", error);
                    ui.notifications.error(`Failed to apply ${item.name} to ${actor.name}`);
                    return false;
                }
            }
            
            // For other items, use the standard drop handling
            return super._onDrop(event);
        }
        else {
            return super._onDrop(event);
        }
    }
}

export { PTUActorSheet }