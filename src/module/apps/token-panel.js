export class TokenPanel extends Application {
    get token() {
        return canvas.tokens.controlled.at(0)?.document ?? null;
    }

    get actor() {
        return this.token?.actor ?? game.user?.character ?? null;
    }

    /**
     * Debounce and slightly delayed request to re-render this panel. Necessary for situations where it is not possible
     * to properly wait for promises to resolve before refreshing the UI.
     */
    refresh = foundry.utils.debounce(this.render, 100);

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ptu-token-panel",
            template: "systems/ptu/static/templates/apps/token-panel.hbs",
            popOut: false,
        });
    }

    /** @override */
    async getData(options = {}) {
        const { actor } = this;
        if (!actor || !game.user.settings.showTokenPanel) return {
            user: { isGM: false },
            actor: null,
        };

        const attacks = [];
        const struggles = [];
        for (const [id, attack] of actor.attacks.entries()) {
            if (attack.item.getFlag("ptu", "showInTokenPanel") === false) continue;
            const data = {
                name: attack.label,
                img: attack.img,
                db: attack.item?.damageBase ? attack.item.damageBase.postStab : null,
                ac: attack.item?.system.ac > 0 ? attack.item.system.ac : null,
                frequency: attack.item?.system.frequency ?? "At-Will",
                id,
                rollable: !!attack.roll,
                effect: attack.item?.system.effect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(foundry.utils.duplicate(attack.item.system.effect), {async: true}) : "",
                range: attack.item?.system.range ?? "",
                keywords: attack.item?.system.keywords ?? [],
                sort: attack.item?.sort ?? 0,
            };
            if(attack.item?.system.category) data.category = `/systems/ptu/static/css/images/types2/${attack.item?.system.category}IC_Icon.png`;
            if (attack.item.system.isStruggle) struggles.push(data);
            else attacks.push(data);
        }

        const items = actor.itemTypes.item?.sort((a, b) => a.sort - b.sort)?.reduce((acc, item) => {
            if (item.getFlag("ptu", "showInTokenPanel") === false) return acc;
            if (item.getFlag("ptu", "showInTokenPanel") !== false && (item.getFlag("ptu", "showInTokenPanel") !== true && !item.roll)) return acc;
            if (item instanceof CONFIG.PTU.Item.documentClasses.pokeball) acc.balls.push(item);
            else acc.other.push(item);
            return acc;
        }, { balls: [], other: [] });

        const feats = [];
        for (const feat of actor.itemTypes.feat?.sort((a, b) => a.sort - b.sort) ?? []) {
            if (feat.getFlag("ptu", "showInTokenPanel") === false) continue;
            feats.push({
                name: feat.name,
                img: feat.img,
                id: feat.id,
                effect: feat.system.effect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(foundry.utils.duplicate(feat.system.effect), {async: true}) : "",
                frequency: feat.system.frequency,
                rollable: !!feat.roll,
                keywords: feat.system.keywords,
            })
        }

        const abilities = []
        for (const ability of actor.itemTypes.ability?.sort((a, b) => a.sort - b.sort) ?? []) {
            if (ability.getFlag("ptu", "showInTokenPanel") === false) continue;
            abilities.push({
                name: ability.name,
                img: ability.img,
                id: ability.id,
                effect: ability.system.effect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(foundry.utils.duplicate(ability.system.effect), {async: true}) : "",
                frequency: ability.system.frequency,
                rollable: !!ability.roll,
            })
        }

        const effects = [];
        for (const effect of actor.itemTypes.effect?.sort((a, b) => a.sort - b.sort) ?? []) {
            if (effect.getFlag("ptu", "showInTokenPanel") === false) continue;
            effects.push({
                id: effect.id,
                parent: effect.parent.id,
                name: effect.name,
                img: effect.img,
                effect: effect.system.effect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(foundry.utils.duplicate(effect.system.effect), {async: true}) : "",
            });
        }

        let movement = [];
        movement.push(
            {name: "Overland", value: actor.system.capabilities?.overland ?? 0, icon: "fas fa-shoe-prints"},
            {name: "Swim", value: actor.system.capabilities?.swim ?? 0, icon: "fas fa-swimmer"},
            {name: "Burrow", value: actor.system.capabilities?.burrow ?? 0, icon: "fas fa-mountain"},
            {name: "Levitate", value: actor.system.capabilities?.levitate ?? 0, icon: "fas fa-feather"},
            {name: "Sky", value: actor.system.capabilities?.sky ?? 0, icon: "fab fa-fly"},
            {name: "Teleporter", value: actor.system.capabilities?.teleporter ?? 0, icon: "fas fa-people-arrows"},
            {name: "Throwing", value: actor.system.capabilities?.throwingRange ?? 0, icon: "fas fa-baseball-ball"},
        );

        movement = movement.filter(item => item.value !== 0);

        let heldItem = null;
        if(this.actor.system.heldItem && this.actor.system.heldItem != "None") {
            const item = await game.ptu.item.get(this.actor.system.heldItem, "item");
            heldItem = {
                name: item?.name || this.actor.system.heldItem,
                img: item?.img || "icons/svg/item-bag.svg",
            }
        }

        const show = {
            party: true, // Default to expanded
            ...game.user.getFlag("ptu", "TokenPanel.show") ?? {}
        };

        return {
            ...(await super.getData(options)),
            user: { isGM: game.user.isGM },
            actor,
            attacks: attacks.sort((a, b) => a.sort - b.sort),
            struggles,
            items,
            show,
            party: this.#getPartyInfo(),
            conditions: actor.itemTypes.condition || [],
            effects,
            feats,
            abilities,
            heldItem,
            movement
        }
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        if ($('#actions-accordion').find(".actions-actions, .struggles-actions").length > 1) {
            $html.find('#actions-accordion').enhsplitter({
                position: game.user.getFlag("ptu", "TokenPanel.actionsSplit") ?? "50%",
                splitterSize: "10px",
                minSize: 0,
                onDragEnd: (e, c) => game.user.setFlag("ptu", "TokenPanel.actionsSplit", c.currentPosition),
            });
        }
        if ($('#items-accordion').find(".pokeball-items, .other-items").length > 1) {
            $html.find('#items-accordion').enhsplitter({
                position: game.user.getFlag("ptu", "TokenPanel.itemsSplit") ?? "50%",
                splitterSize: "10px",
                minSize: 0,
                onDragEnd: (e, c) => game.user.setFlag("ptu", "TokenPanel.itemsSplit", c.currentPosition),
            });
        }

        for (const toggle of $html.find(".toggle-bar .action, .top-panel-toggle")) {
            toggle.addEventListener("click", (event) => {
                const target = event.currentTarget.dataset.target;
                const isShown = game.user.getFlag("ptu", `TokenPanel.show.${target}`);
                game.user.setFlag("ptu", `TokenPanel.show.${target}`, !isShown);
                this.refresh();
            });
        }

        for (const action of $html.find(".actions-accordion .action")) {
            action.addEventListener("click", (event) => {
                const id = event.currentTarget.dataset.id;
                const attack = this.actor.attacks.get(id);
                if (!attack) return;

                attack.roll?.({
                    event, callback: async (rolls, targets, msg, event) => {
                        if (!game.settings.get("ptu", "autoRollDamage")) return;

                        const params = {
                            event,
                            options: msg.context.options ?? [],
                            actor: msg.actor,
                            targets: msg.targets,
                            rollResult: msg.context.rollResult ?? null,
                        }
                        const result = await attack.damage?.(params);
                        if (result === null) {
                            return await msg.update({ "flags.ptu.resolved": false })
                        }
                    }
                });
            });
            action.addEventListener("contextmenu", (event) => {
                const id = event.currentTarget.dataset.id;
                const attack = this.actor.attacks.get(id);
                return attack?.item?.sendToChat?.();
            });
        }

        for (const action of $html.find(".pokeball-items .action")) {
            action.addEventListener("click", (event) => {
                const id = event.currentTarget.dataset.id;
                const ball = this.actor.items.get(id);
                if (!ball) return;

                ball.roll?.({event});
            });
        }

        for (const action of $html.find(".items-accordion .action, .abilities .action, .feats .action")) {
            action.addEventListener("contextmenu", (event) => {
                const id = event.currentTarget.dataset.id;
                const item = this.actor.items.get(id);
                return item?.sendToChat?.();
            });
        };

        for (const actor of $html.find(".trainer, .pokemon")) {
            actor.addEventListener("click", (event) => {
                const target = event.currentTarget;
                clearTimeout(this._clickActorTimeout);
                this._clickActorTimeout = setTimeout(() => {
                    const id = target.dataset.id;
                    const actor = game.actors.get(id);
                    if (!actor) return;

                    const token = actor?.getActiveTokens(true)[0];
                    if (!token) return;

                    token.control({ releaseOthers: true });
                    canvas.animatePan({ x: token.document.x, y: token.document.y });
                }, 200);
            });
            actor.addEventListener("dblclick", (event) => {
                clearTimeout(this._clickActorTimeout);
                const id = event.currentTarget.dataset.id;
                const actor = game.actors.get(id);
                if (!actor) return;

                actor.sheet.render(true);
            });
            actor.addEventListener("mouseover", (event) => {
                event.preventDefault();
                if (!canvas.ready) return;

                const id = event.currentTarget.dataset.id;
                const actor = game.actors.get(id);
                if (!actor) return;

                const tokens = actor?.getActiveTokens(true);
                if (tokens?.length == 0) return;

                if (tokens.every(token => token.isVisible)) {
                    tokens.forEach(token => token._onHoverIn(event));
                    this.highlights = tokens;
                }
            });
            actor.addEventListener("mouseout", (event) => {
                event.preventDefault();
                if (!canvas.ready) return;

                if (this.highlights?.length > 0) {
                    this.highlights.forEach(token => token._onHoverOut(event));
                    this.highlights = [];
                }
            });
            actor.addEventListener("dragstart", (event) => {
                const id = event.currentTarget.dataset.id;
                const actor = game.actors.get(id);
                if (!actor) return;

                event.dataTransfer.setData("text/plain", JSON.stringify({
                    type: "Actor",
                    uuid: actor.uuid,
                }));
            });
        }

        for (const item of $html.find(".condition, .effect")) {
            item.addEventListener("click", (event) => {
                const target = event.currentTarget;
                clearTimeout(this._clickEffectTimeout);
                this._clickEffectTimeout = setTimeout(() => {
                    const id = target.dataset.actorId;
                    const actor = game.actors.get(id);
                    if (!actor) return;

                    const itemId = target.dataset.itemId;
                    const item = actor.items.get(itemId);
                    if (!item) return;

                    item.increase();
                }, 200);
            });
            item.addEventListener("dblclick", (event) => {
                clearTimeout(this._clickEffectTimeout);
                const id = event.currentTarget.dataset.actorId;
                const actor = game.actors.get(id);
                if (!actor) return;

                const itemId = event.currentTarget.dataset.itemId;
                const item = actor.items.get(itemId);
                if (!item) return;

                item.sheet.render(true);
            });
            item.addEventListener("contextmenu", (event) => {
                const id = event.currentTarget.dataset.actorId;
                const actor = game.actors.get(id);
                if (!actor) return;

                const itemId = event.currentTarget.dataset.itemId;
                const item = actor.items.get(itemId);
                if (!item) return;

                if (event.shiftKey) return item.decrease();
                Dialog.confirm({
                    title: `${(item.system.value?.value > 1) ? "Decrease" : "Delete"} ${item.name}?`,
                    content: `<p>Are you sure you want to ${(item.system.value?.value > 1) ? "decrease" : "delete"} ${item.name}?</p>`,
                    yes: () => item.decrease(),
                    no: () => { },
                    defaultYes: false
                })
            });
        }

        $html.find(".action[title], .condition[title], .effect[title]").tooltipster({
            theme: `tooltipster-shadow ball-themes ${this.actor?.sheet?.ballStyle}`,
			position: 'top',
            maxWidth: 500,
            contentAsHTML: true,
            interactive: true,
		});
    }

    #getPartyInfo() {
        const party = {
            trainer: null,
            pokemon: [],
            isTrainer: false,
        };
        if (this.actor.type == "pokemon") {
            (() => {
                // if a trainer is set, get the actor
                if (this.actor.flags?.ptu?.party?.trainer) {
                    party.trainer = game.actors.get(this.actor.flags.ptu.party.trainer);

                    return;
                }

                // Otherwise, try find the trainer from the user
                if (game.user.character && game.user.character.type == "trainer") {
                    this.trainer = game.user.character;
                    return;
                }

                // Otherwise, attempt to find the trainer from ownership permissions
                const pool = [];
                for (const [owner, value] of Object.entries(this.actor.ownership)) {
                    if (owner == "default" || value < 3) continue;

                    const user = game.users.get(owner);
                    if (!user) continue;

                    if (user.character && user.character.type == "character") {
                        pool.push(user.character);
                    }
                }
                if (pool.length == 1) {
                    this.trainer = pool[0];
                    return;
                }
            })()
        }
        else {
            party.trainer = this.actor;
            party.isTrainer = true;
        }

        if (!party.trainer) return party;

        const folder = party.trainer.folder;
        if (!folder) return party;

        const partyFolder = folder.children.find(folder => folder.folder.name == "Party")?.folder;
        if (!partyFolder) return party;

        const pokemon = partyFolder.contents.filter(actor => actor.type == "pokemon" &&
            actor.flags?.ptu?.party?.trainer == party.trainer.id &&
            !actor.flags?.ptu?.party?.boxed);

        if (pokemon.length > 0) party.pokemon = pokemon;
        return party;
    }
}