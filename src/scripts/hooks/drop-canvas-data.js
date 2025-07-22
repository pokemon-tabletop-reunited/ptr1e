import { PTUSpeciesDragOptionsPrompt } from "../../module/apps/species-drag-in/sheet.js";

export const DropCanvasData = {
    listen() {
        Hooks.on("dropCanvasData", async (canvas, drop) => {
            if(drop.type == "Item") {
                const item = await fromUuid(drop.uuid);
                if(item?.type == "species") {
                    new PTUSpeciesDragOptionsPrompt(item, { x: drop.x, y: drop.y }).render(true);
                }
            }
        });

        // Handle dropping items onto tokens
        Hooks.on("dropCanvasData", (_canvas, data) => {
            const rect = new PIXI.Rectangle(data.x, data.y, 0, 0);
            const dropTarget = Array.from(canvas.tokens.quadtree.getObjects(rect, {collisionTest: o => o.t.hitArea.contains(data.x - o.t.x, data.y - o.t.y)})).at(0);

            const actor = dropTarget?.actor;
            if (actor && data.type === "Item" && data.uuid) {
                actor.sheet.emulateItemDrop(data);
                return false; // Prevent modules from doing anything further
            }

            return true;
        });
    }
}