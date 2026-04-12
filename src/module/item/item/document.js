import { PTUItem } from '../index.js';
class PTUItemItem extends PTUItem {

    get container() {
        return this.grantedBy;
    }

    get isContainer() {
        return this.system.container;
    }

    prepareBaseData() {
        super.prepareBaseData();
        
        if(this.enabled) {
            this.flags.ptu.rollOptions.all[`item:equipped`] = true;
            this.flags.ptu.rollOptions.item[`item:equipped`] = true;
        }
    }

    /** @override */
    prepareSiblingData() {
        const itemGrants = this.flags.ptu.itemGrants;
        if(!itemGrants) return this.grants = [];
        this.grants = Object.values(itemGrants).flatMap((grant) => {
            return this.actor?.items.get(grant.id) ? [this.actor.items.get(grant.id)] : [];
        }).sort((a,b) => (a.sort || 0) - (b.sort || 0));
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        let oldClass = {}, newClass = {};
        
        if(changed.flags?.ptu?.grantedBy !== undefined) {
            const container = this.actor?.items.get(changed.flags.ptu.grantedBy.id);
            if(container) {
                newClass.actor = container;
                newClass.update = {"flags.ptu.itemGrants": {[this._id]: {id: this._id, onDelete: "detach"}}};   
            }
            if(this.flags.ptu?.grantedBy?.id) {
                const oldContainer = this.actor?.items.get(this.flags.ptu.grantedBy.id);
                if(oldContainer) {
                    oldClass.actor = oldContainer;
                    oldClass.update = {"flags.ptu.itemGrants": {[`-=${this._id}`]: null}};
                }
            }
        }
        else if(changed.flags?.ptu?.["-=grantedBy"] !== undefined) {
            const oldContainer = this.actor?.items.get(this.flags.ptu?.grantedBy?.id);
            if(oldContainer) {
                oldClass.actor = oldContainer;
                oldClass.update = {"flags.ptu.itemGrants": {[`-=${this._id}`]: null}};
            }
        }

        super._preUpdate(changed, options, user);

        if(oldClass?.actor) await oldClass.actor.update(oldClass.update);
        if(newClass?.actor) await newClass.actor.update(newClass.update);
    }

    async purchase() {
        const actor = (() => {
            const character = game.user.character;
            if(character) return character;

            const token = canvas.tokens.controlled[0];
            if(token) return token.actor;

            return null;
        })();
        if(!actor) return ui.notifications.error("No actor selected");

        const amount = this.system.cost;
        
        if ((actor.system.money ?? 0) < amount) return ui.notifications.error(`${actor.name} does not have enough money to pay for ${this.name} (Cost: ${amount} Poké, Current: ${actor.system.money})`);
        await actor.update({
            "system.money": actor.system.money - amount,
        });

        // If duplicate item gets added instead increase the quantity
        const existingItem = actor.items.get(this._id) ?? actor.items.getName(this.name);
        if (existingItem && existingItem.system.quantity !== undefined) {
            const quantity = Math.ceil(Number(foundry.utils.duplicate(existingItem.system.quantity)) || 0, 0);
            await existingItem.update({ "system.quantity": quantity + 1 });
        }
        else {
            await Item.create(this.toObject(), {parent: actor});
        }
        return ui.notifications.info(`${actor.name} Paid ${amount} Poké for ${this.name} (New Total: ${actor.system.money})`);
    }
}

export { PTUItemItem }