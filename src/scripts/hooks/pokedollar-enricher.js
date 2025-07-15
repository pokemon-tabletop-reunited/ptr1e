export const PokeDollarEnricher = {
    listen: () => {
        Hooks.on('setup', () => {
            CONFIG.TextEditor.enrichers.push({
                pattern: /\@Poke\[((\d+)|([0-9a-zA-Z\-=. ]*?))( noname)?\]/gim,
                enricher: async (match, options) => {
                    const [_, input, __, ___, noname] = match;
                    const data = {
                        cls: ["content-link", "pokedollar"],
                    };
                    const [amount, item] = await (async () => {
                        let cost = Number(input);
                        if (!isNaN(cost)) return [cost, null];

                        const item = await fromUuid(input);
                        if (!item || item.type != "item") return [null, null];

                        return [item.system.cost, item];
                    })();
                    
                    if(!amount && !item) return;

                    if(!item) {
                        data.inner = `<span>${amount}</span>`;
                        data.title = `${amount} Poké`;
                        data.dataset = {amount};
                    }
                    else {
                        data.inner = `Purchase ${noname === undefined ? `${item.name} ` : ""}(<span>${item.system.cost}</span>)`;
                        data.title = `Purchase ${item.name} (${item.system.cost} Poké)`;
                        data.dataset = {amount: item.system.cost, item: item.uuid};
                        data.cls.push("cost")
                    }

                    return new Promise(resolve => {
                        const anchor = document.createElement("a");
                        anchor.draggable = amount > 0;
                        anchor.classList.add(...data.cls);
                        anchor.innerHTML = data.inner;
                        anchor.title = data.title;
                        for(const [k, v] of Object.entries(data.dataset)) anchor.dataset[k] = v;
                        resolve(anchor);
                    });
                }
            });
        });

        const activateListeners = (htmlElement) => {
            const anchors = htmlElement.querySelectorAll("a.pokedollar");
            for (const anchor of anchors) {
                const {amount, item} = anchor.dataset;
                anchor.addEventListener("dragstart", ev => {
                    ev.stopPropagation();
                    ev.dataTransfer.setData("text/plain", JSON.stringify({type: "pokedollar", data: {amount, item}}));
                });
                if(item) {
                    anchor.addEventListener("click", async ev => {
                        ev.preventDefault();
                        const document = await fromUuid(item);
                        if(!document) return;
                        await document.purchase();
                    });
                }
                else {
                    anchor.addEventListener("click", async ev => {
                        ev.preventDefault();
                        const actor = (() => {
                            const character = game.user.character;
                            if(character) return character;
                
                            const token = canvas.tokens.controlled[0];
                            if(token) return token.actor;
                
                            return null;
                        })();
                        if(!actor) return ui.notifications.error("No actor selected");
                        if(isNaN(Number(amount))) return ui.notifications.error("Invalid amount");
                        await actor.update({"system.money": actor.system.money + Number(amount)});
                        ui.notifications.info(`${actor.name} Gained ${amount} Poké (New Total: ${actor.system.money})`);
                    });
                }
            }
        }

        // These Sheets should be interactive, such that clicking on the anchor actually does something
        // Due to some performance stutters during development, those are relatively restrictive.
        // It the anchor appears somehwere where it should also work, add an appropriate hook here
        Hooks.on("renderJournalTextPageSheet", (journal, $html) => {
            // maybe related to why this does do need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const journalHtmlElement = $html.filter(".journal-page-content").get(0);
            activateListeners(journalHtmlElement)

        });
        Hooks.on("renderChatMessageHTML", (message, html) => {
            // maybe related to why this does not need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const messageHtmlElement = html;
            activateListeners(messageHtmlElement)

            message.activateListeners($(html))
        });
        Hooks.on("renderPTUItemSheet", (itemSheet, $html) => {
            // maybe related to why this does not need a filter? https://github.com/foundryvtt/foundryvtt/issues/3088
            const itemHtmlElement = $html.get(0)
            activateListeners(itemHtmlElement)
        });
    }
};