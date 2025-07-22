import { sluggify } from '../../../util/misc.js';
import { PTUCondition, PTUItem } from '../index.js';
class PTUMove extends PTUItem {
    get rollable() {
        return !(isNaN(Number(this.system.ac ?? undefined)) && isNaN(Number(this.system.damageBase ?? undefined)));
    }

    get usable() {
        return !this.rollable && this.system.frequency !== "Static";
    }

    /** @override */
    get rollOptions() {
        const options = super.rollOptions;
        if(this.isDamaging && this.damageBase.isStab) {
            options.all['move:is-stab'] = true;
            options.item['move:is-stab'] = true;
        }
        if (this.isDamaging && this.damageBase.isStab && !!options.all[`move:damage-base:${this.damageBase.preStab}`]) {
            delete this.flags.ptu.rollOptions.all[`move:damage-base:${this.damageBase.preStab}`];
            delete this.flags.ptu.rollOptions.item[`move:damage-base:${this.damageBase.preStab}`];

            this.flags.ptu.rollOptions.all[`move:damage-base:${this.damageBase.postStab}`] = true;
            this.flags.ptu.rollOptions.item[`move:damage-base:${this.damageBase.postStab}`] = true;

            options.all[`move:damage-base:${this.damageBase.postStab}`] = true;
            options.item[`move:damage-base:${this.damageBase.postStab}`] = true;
        }
        for(const keyword of this.system.keywords) {
            options.all[`move:${sluggify(keyword)}`] = true;
            options.item[`move:${sluggify(keyword)}`] = true;
        }
        return options;
    }

    /** @override */
    get realId() {
        return this.system.isStruggle
            ? `struggle-${this.system.type.toLocaleLowerCase(game.i18n.lang)}-${this.system.category.toLocaleLowerCase(game.i18n.lang)}${this.system.isRangedStruggle ? "-ranged" : ""}`
            : super.realId;
    }

    get isDamaging() {
        return !isNaN(Number(this.system.damageBase ?? undefined));
    }

    get isFiveStrike() {
        return (!!this.rollOptions.item["move:range:five-strike"]) || (!!this.rollOptions.item["move:five-strike"]);
    }

    get damageBase() {
        if (!this.isDamaging) return null;
        const result = {
            preStab: isNaN(Number(this.system.damageBase)) ? 0 : Number(this.system.damageBase),
            postStab: 0,
            isStab: false,
        }
        result.postStab = result.preStab + (!this.system.isStruggle && this.actor?.types.includes(this.system.type) ? 2 : 0);
        result.isStab = result.preStab !== result.postStab;
        return result;
    }

    /** @override */
    prepareBaseData() {
        super.prepareBaseData();

        const rollOptions = {
            all: {
                [`move:type:${sluggify(this.system.type)}`]: true,
                [`move:category:${sluggify(this.system.category)}`]: true,
                [`move:frequency:${sluggify(this.system.frequency)}`]: true,
            },
        }

        const ranges = this.system.range?.split(",").map(r => r.trim()) ?? [];
        for (const range of ranges) {
            rollOptions.all[`move:range:${sluggify(range)}`] = true;
        }

        if (this.isDamaging) {
            rollOptions.all[`move:damage-base:${this.damageBase.postStab}`] = true;
            rollOptions.all[`move:damage-base:pre-stab:${this.damageBase.preStab}`] = true;
        }
        if (!isNaN(Number(this.system.ac))) rollOptions.all[`move:ac:${this.system.ac}`] = true;
        rollOptions.item = rollOptions.all;

        this.flags.ptu = foundry.utils.mergeObject(this.flags.ptu, {rollOptions});
        this.flags.ptu.rollOptions.attack = Object.keys(this.flags.ptu.rollOptions.all).reduce((obj, key) => {
            obj[key.replace("move:", "attack:").replace("item:", "attack:")] = true;
            return obj;
        }, {});
    }

    /** @override */
    async use(options = {}) {
        if (this.isDamaging || this.system.frequency === "Static") return;

        let didSomething = false;
        const conditions = new Set(this.actor.getFilteredRollOptions("condition"))
        if (conditions.has("condition:confused")) {
            await PTUCondition.HandleConfusion(this, this.actor);
            didSomething = true;
        }

        if (this.referenceEffect) {
            const results = [];
            const effect = await fromUuid(this.referenceEffect);
            if (this.range.includes("Self")) {
                const result = await effect.apply([this.actor], this.actor);
                if (result) results.push(...result);
            }
            else {
                const targets = options.targets || [...game.user.targets] || canvas.tokens.controlled;
                const result = await effect.apply(targets, this.actor);
                if (result) results.push(...result);
            }

            if (results.length > 0) {
                const statements = results.map((effect) =>
                    game.i18n.format("PTU.Broadcast.ApplyEffect", { actor: effect.actor.link, effect: effect.link, source: this.actor.link })
                ).filter(s => s).join("<br/>")
                const enrichedHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(statements, { async: true })
                const chatData = {
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/effect-applied.hbs", { statements: enrichedHtml }),
                    type: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    whisper: this.actor.hasPlayerOwner ? [game.user.id] : game.users.filter(u => u.isGM).map(u => u.id),
                };
                await ChatMessage.create(chatData);
                didSomething = true;
            }
        }

        if (!didSomething) {
            ui.notifications.warn(game.i18n.localize("PTU.Notifications.NoEffect"));
        }
    }
}

export { PTUMove }