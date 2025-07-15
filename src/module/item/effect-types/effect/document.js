import { isObject, sluggify } from '../../../../util/misc.js';
import { BaseEffectPTU } from '../base.js';
class PTUEffect extends BaseEffectPTU {
    static DURATION_UNITS = {
        rounds: 10,
        minutes: 60,
        hours: 3600,
        days: 86400,
    }

    get badge() {
        return this.system.badge
    }

    get level() {
        return this.system.level.value
    }

    get isIdentified() {
        return !this.system.unidentified;
    }

    /** @override */
    prepareBaseData() {
        super.prepareBaseData();

        const { system } = this;
        if (["unlimited", "encounter"].includes(system.duration.unit)) {
            system.duration.expiry = null;
        } else {
            system.duration.expiry ||= "turn-start";
        }
        system.expired = this.remainingDuration.expired;

        const badge = this.system.badge;
        if(badge?.type === "counter") {
            const max = badge.labels?.length ?? Infinity;
            badge.value = Math.clamp(badge.value, 1, max);
            badge.label = badge.labels?.at(badge.value -1)?.trim() || null;  
        }
    }

    /** @override */
    prepareRuleElements(options) {
        const autoExpireEffects = game.settings.get("ptu", "automation.autoExpireEffects");
        if(autoExpireEffects && this.isExpired && this.actor?.items.has(this.id)) {
            for(const rule of this.system.rules) rule.ignored = true;
        }
        return super.prepareRuleElements(options);
    }

    async increase() {
        const badge = this.system.badge;
        if(badge?.type === "counter" && !this.isExpired) {
            if(badge.value >= (badge.labels?.length ?? Infinity)) return;

            return await this.update({"system.badge.value": foundry.utils.duplicate(badge.value)+1});
        }
    }

    async decrease() {
        if(this.system.badge?.type !== "counter" || this.system.badge.value === 1 || this.isExpired) return await this.delete();

        return await this.update({"system.badge.value": foundry.utils.duplicate(this.system.badge.value)-1});
    }

    async apply(targets, source = null) {
        const results = [];
        for(const target of targets) {
            const actor = 
                typeof target === "string" ? await fromUuid(target)
                : target instanceof CONFIG.Token.objectClass ? target.actor
                : target instanceof CONFIG.PTU.Actor.documentClass ? target 
                : target.actor && target.actor instanceof CONFIG.PTU.Actor.documentClass ? target.actor : null;
            if(!actor) continue;
            
            const effectData = this.toObject();
            if(source) effectData.system.origin = source?.uuid ?? source;

            const effect = await actor.createEmbeddedDocuments("Item", [effectData]);
            results.push(...effect);
        }
        return results;
    }

    /** @override */
    async _preCreate( data, options, user ) {
        const badge = data.system?.badge;
        if(this.actor && badge?.type === "formula" && badge.evaluate) {
            const roll = await new Roll(badge.value, this.getRollData()).evaluate();
            this._source.system.badge = { type: "value", value: roll.total };
            const speaker = ChatMessage.getSpeaker({ actor: this.actor, token: this.actor.token });
            roll.toMessage({ flavor: this.name, speaker });
        }

        return super._preCreate(data, options, user);
    }

    /** @override */
    async _preUpdate( changed, options, user ) {
        const duration = changed.system?.duration;
        if(duration?.unit === "unlimited") {
            duration.expiry = null;
        } 
        else if(typeof duration?.unit === "string" && !["unlimited", "encounter"].includes(duration.unit)) {
            duration.expiry ||= "turn-start";
            if(duration.value === -1) duration.value = 1;
        }

        const badge = changed.system?.badge;
        if(isObject(badge) && badge?.type && badge?.value !== undefined) {
            badge.value = 1;
        }

        return super._preUpdate(changed, options, user);
    }

    /** @override */
    _onDelete(options, userId) {
        super._onDelete(options, userId);
    }
}

export { PTUEffect }