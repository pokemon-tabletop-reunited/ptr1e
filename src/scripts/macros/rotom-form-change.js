export function changeRotomForm() {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor?.species?.slug.startsWith("rotom")) return ui.notifications.error("Please select your Rotom on the canvas before running this macro.");

    const change = async (forme) => {
        const notifId = ui.notifications.info("Updating rotom...")
        const [species, move] = await (async () => {
            switch (forme) {
                case "normal": return [await game.ptu.item.get("rotom-normal", "species"), null]
                case "fan": return [await game.ptu.item.get("rotom-fan", "species"), await game.ptu.item.get("air-slash", "move")]
                case "frost": return [await game.ptu.item.get("rotom-frost", "species"), await game.ptu.item.get("blizzard", "move")]
                case "heat": return [await game.ptu.item.get("rotom-heat", "species"), await game.ptu.item.get("overheat", "move")]
                case "mow": return [await game.ptu.item.get("rotom-mow", "species"), await game.ptu.item.get("leaf-storm", "move")]
                case "wash": return [await game.ptu.item.get("rotom-wash", "species"), await game.ptu.item.get("hydro-pump", "move")]
            }
        })();
        if (!species) return ui.notifications.error("Could not find rotom species");
        if (actor.species.slug === species.slug) return ui.notifications.warn("Cancelled update as no changes were detected.");
        const image = species.getImagePath({ shiny: !!actor.system.shiny });

        const newSize = (() => {
            const size = species.system.size.sizeClass;
            switch (size) {
                case "Tiny": return { width: 0.5, height: 0.5 };
                case "Small": return { width: 1, height: 1 };
                case "Medium": return { width: 1, height: 1 };
                case "Large": return { width: 2, height: 2 };
                case "Huge": return { width: 3, height: 3 };
                case "Gigantic": return { width: 4, height: 4 };
                default: return { width: 1, height: 1 };
            }
        })();

        const toCreate = [species.toObject()];

        if (actor.species.slug == "rotom-normal") {
            toCreate.push(move.toObject());
        }
        if (actor.species.slug != "rotom-normal") {
            const moveSlug = (() => {
                switch (actor.species.system.form) {
                    case "fan": return "air-slash";
                    case "frost": return "blizzard";
                    case "heat": return "overheat";
                    case "mow": return "leaf-storm";
                    case "wash": return "hydro-pump";
                }
            })();
            const item = actor.itemTypes.move.find(m => m.slug == moveSlug);
            if (item) await actor.deleteEmbeddedDocuments("Item", [item.id]);
            if (move) toCreate.push(move.toObject());
        }

        await actor.createEmbeddedDocuments("Item", toCreate);
        await actor.update({
            img: image,
            "prototypeToken.texture.src": image,
            "prototypeToken.width": newSize.width,
            "prototypeToken.height": newSize.height
        });
        for (const token of actor.getActiveTokens()) {
            await token.document.update({
                "texture.src": image,
                "width": newSize.width,
                "height": newSize.height
            });
        }
        ui.notifications.remove(notifId);
    }

    const d = new Dialog({
        title: "Rotom Form Change",
        content: "What form should rotom change into?",
        buttons: {
            normal: { label: "Normal", callback: () => change("normal") },
            fan: { label: "Fan", callback: () => change("fan") },
            frost: { label: "Frost", callback: () => change("frost") },
            heat: { label: "Heat", callback: () => change("heat") },
            mow: { label: "Mow", callback: () => change("mow") },
            wash: { label: "Wash", callback: () => change("wash") }
        }
    })
    d.render(true);
}