class ItemSummaryRenderer {

    constructor(sheet) {
        this.sheet = sheet;
    }

    activateListeners($html) {
        const headerElements = $html.find('.item .item-name h4');
        for(const el of headerElements) {
            el.addEventListener('click', async () => {
                const element = el.closest('[data-item-id], .expandable');
                if(element) await this.toggleSummary(element);
            });

            this.initialOpen(el);
        }
    }

    initialOpen(el) {
        const element = el.closest('[data-item-id], .expandable');
        if(!element) return;

        const item = this.sheet.actor.items.get(element.dataset.itemId);
        if(!item) return;
        
        const sheetState = game.user.getFlag("ptu", "sheetStates")?.[this.sheet.actor.id];
        if(!sheetState) return;

        const state = sheetState[item.type]?.[item.id];
        if(state) return this.toggleSummary(element);
    }

    async toggleSummary(element) {
        const actor = this.sheet.actor;

        const { itemId } = element.dataset;

        const duration = 0.4;

        const item = actor.items.get(itemId);
        if(!item) return;

        const summary = await (async () => {
            const existing = element.querySelector(':scope > .item-summary');
            if(existing) return existing;

            const nodes = element.querySelectorAll(':scope > .item-info, :scope > .item-controls, :scope > .move-info');
            const insertLocation = nodes[nodes.length - 1];

            const summary = document.createElement('div');
            summary.classList.add('item-summary');
            summary.classList.add('pb-2');
            summary.hidden = true;
            insertLocation.after(summary);

            const summaryWithContent = await this.renderItemSummary(summary, item);
            if(summaryWithContent.innerHTML === '') return;
            return summaryWithContent;
        })();

        if(!summary) return;

        const showSummary = !element.classList.contains('expanded') || summary.hidden;

        if(showSummary) {
            element.classList.add('expanded');
            summary.hidden = false;
            await new Promise(resolve => setTimeout(resolve, 1));
            summary.classList.add('show');
            await game.user.setFlag("ptu", "sheetStates", foundry.utils.mergeObject(game.user.getFlag("ptu", "sheetStates") || {}, {
                [actor.id]: {
                    [item.type]: {
                        [item.id]: true
                    }
                }
            }));
        }
        else {
            element.classList.remove('expanded');
            summary.classList.remove('show');
            summary.classList.add('transitioning')
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            summary.classList.remove('transitioning')
            summary.hidden = true;
            await game.user.setFlag("ptu", "sheetStates", foundry.utils.mergeObject(game.user.getFlag("ptu", "sheetStates") || {}, {
                [actor.id]: {
                    [item.type]: {
                        [item.id]: false
                    }
                }
            }));
        }
    }

    async renderItemSummary(element, item) {
        const textContent = this._newLineToBreak(item.system.snippet ? item.system.snippet : item.system.effect).trim();
        const slice = textContent.indexOf('Effect:');
        const content = "<p>" + (slice > 0 ? textContent.slice(0, slice) + "</p><hr><p>" + textContent.slice(slice) : textContent) + "</p>"
            + (item.referenceEffect ? `<hr><p>@UUID[${item.referenceEffect}]</p>` : "");

        element.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content, {async: true})
        return element;
    }

    _newLineToBreak(content) {
        return (""+content).replaceAll(/(?:\r\n|\r|\n|\\n)/g, '<br>');
    }

}

export { ItemSummaryRenderer }