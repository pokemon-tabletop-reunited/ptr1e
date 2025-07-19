import { RuleElements } from "../rules/index.js";
import { processGrantDeletions } from "../rules/rule-element/grant-item/helper.js";
import { sluggify } from "../../util/misc.js"
import { GrantItemRuleElement } from "../rules/rule-element/grant-item/rule-element.js";

class PTUItem extends Item {

    get sourceId() {
        return this.flags?.core?.sourceId ?? undefined;
    }

    get schemaVersion() {
        return Number(this.system.schema?.version) || null;
    }

    get slug() {
        return this.system.slug || sluggify(this.name);
    }

    get grantedBy() {
      // return this.flags.ptu.grantedBy ? this.actor?.items.get(this.flags.ptu.grantedBy.id) : null;
      const id = this.flags.ptu.grantedBy?.id ?? "";
      return ((id === this.id) ? null : (this.actor?.items.get(id) ?? null));
    }

    get grantedBySameType() {
        return this.grantedBy?.type === this.type;
    }

    get isGranted() {
        return this.flags.ptu.grantedBy ? this.flags.ptu.grantedBy.onDelete != "detach" : false;
    }

    get hasAutomation() {
        return this.rules.length > 0 && this.rules.some((rule) => !rule.ignored);
    }

    get realId() {
        return this.id;
    }

    get rollOptions() {
        return this.flags.ptu?.rollOptions;
    }

    get rollable() {
        return false;
    }

    get usable() {
        return false;
    }

    get range() {
        return this.system.range?.split(",").map(r => r.trim()) ?? [];
    }

    get referenceEffect() {
        return this.system.referenceEffect ?? null;
    }

    get schemaVersion() {
        return Number(this.system.schema?.version) || null;
    }

    get isClass() {
        return this.img.includes("class");
    }

    get enabled() {
        return !!(this.system.enabled ?? true)
    }

    /** Change state of whether items automation should be enabled or disabled. If called
     *  without argument, toggles between on and off.
     * @param newState
     * @return {Promise<abstract.Document|*>}
     */
    async toggleEnableState(newState = !this.enabled) {
        await this.update({ "system.enabled": newState })
        for (const rule of this.rules) {
            if (rule.ignored || !(rule instanceof GrantItemRuleElement)) continue;
            return this.actor.update({ "system.timestamp": Date.now() })
        }
    }

    /** @override */
    prepareBaseData() {
        this.flags.ptu = foundry.utils.mergeObject({ rulesSelections: {} }, this.flags.ptu ?? {});

        this.flags.ptu = foundry.utils.mergeObject(this.flags.ptu ?? {}, {
            rollOptions: {
                all: {
                    [`item:id:${this._id}`]: true,
                    [`item:slug:${this.slug}`]: true,
                    [`item:type:${this.type}`]: true,
                    [`${this.type}:${this.slug}`]: true
                },
                item: {
                    [`item:id:${this._id}`]: true,
                    [`item:slug:${this.slug}`]: true,
                    [`item:type:${this.type}`]: true,
                    [`${this.type}:${this.slug}`]: true,
                }
            }
        });

        if (this.enabled) {
            this.flags.ptu.rollOptions.all[`item:enabled`] = true;
            this.flags.ptu.rollOptions.item[`item:enabled`] = true;
        }
    }

    /** @override */
    _initialize() {
        this.rules = [];
        super._initialize();
    }

    /** @override */
    async delete(context) {
        if (this.actor) {
            await this.actor.deleteEmbeddedDocuments("Item", [this._id], context);
            return this;
        }
        return super.delete(context);
    }

    /** @override */
    async _buildEmbedHTML(config, options = {}) {
        options = { ...options, _embedDepth: options._embedDepth + 1, relativeTo: this };
        if (!this.system?.effect) return document.createElement("div");
        const {
            secrets = options.secrets,
            documents = options.documents,
            links = options.links,
            rolls = options.rolls,
            embeds = options.embeds
        } = config;
        foundry.utils.mergeObject(options, { secrets, documents, links, rolls, embeds });
        const enrichedPage = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.effect, options);
        const container = document.createElement("div");
        container.innerHTML = enrichedPage;
        return container;
    }

    /**
     * Retrieve all roll option from the requested domains. Micro-optimized in an excessively verbose for-loop.
     * @param domains The domains of discourse from which to pull options. Always includes the "all" domain.
     */
    getRollOptions(domains = []) {
        if (!Array.isArray(domains)) domains = [domains];
        const withAll = Array.from(new Set(["all", ...domains]));
        const { rollOptions } = this;
        const toReturn = new Set();

        for (const domain of withAll) {
            for (const [option, value] of Object.entries(rollOptions[domain] ?? {})) {
                if (value) toReturn.add(option);
            }
        }

        return Array.from(toReturn).sort();
    }

    /** @override */
    getRollData() {
        return { actor: this.actor, item: this };
    }

    _updateIcon({ source, update } = { source: undefined, update: false }) {
        source ??= foundry.utils.duplicate(this);

        let required = false;
        source.img ||= `/systems/ptu/static/css/images/icons/${source.type}_icon.png`
        if (source.img == "icons/svg/item-bag.svg" || source.img == "icons/svg/mystery-man.svg") {
            if (source.type == "move") {
                source.img = CONFIG.PTU.data.typeEffectiveness[source.system.type.titleCase()].images.icon;
            }
            else if (source.type == "contestmove") {
                source.img = `/systems/ptu/static/css/images/types2/${source.system.type}IC_Icon.png`;
            }
            else {
                source.img = `/systems/ptu/static/css/images/icons/${source.type}_icon.png`;
            }
            required = true;
        }

        if (update && required) return this.update(source);
        else return source;
    }

    /** @override */
    prepareActorData() {
        const { actor } = this;
        if (!actor) return;
        const slug = this.slug;
        actor.rollOptions.all[`${this.type}:${slug}`] = true;
    }

    /** @override */
    static async createDocuments(data = [], context = {}) {
        const sources = data.map((d) => (d instanceof PTUItem ? d.toObject() : d));

        const actor = context.parent;
        if (!actor) return super.createDocuments(sources, context);

        const validTypes = actor.allowedItemTypes;
        const items = [];
        const outputSources = [];

        for (const source of sources) {
            if (!validTypes.includes(source.type)) {
                ui.notifications.error(`PTU | ${source.type.capitalize()}s cannot be added to ${actor.name}`);
                return [];
            }

            if (!(context.keepId || context.keepEmbeddedIds)) {
                source._id = foundry.utils.randomID();
            }

            if (source.system.stackSlugs) source.system.slug = sluggify(source.name + foundry.utils.randomID());

            const item = new CONFIG.Item.documentClass(source, { parent: actor });

            if (item.type === "condition") {
                const existing = actor.itemTypes.condition.find(c => c.slug === sluggify(item.name.replaceAll(/\d/g, '')));
                if (existing) {
                    if (existing.system.value.isValued) existing.increase();
                    continue;
                }
            }

            items.push(item);
            outputSources.push(item._source);
        }

        if (!context.keepId) context.keepId = true;

        const getSimpleGrants = async (item) => {
            const granted = (await item.createGrantedItems?.({ size: context.parent?.size })) ?? [];
            if (!granted.length) return [];
            const reparented = granted.map(
                (i) =>
                (i.parent
                    ? i
                    : new CONFIG.Item.documentClass(i._source, { parent: actor }))
            );
            return [...reparented, ...(await Promise.all(reparented.map(getSimpleGrants))).flat()];
        };

        const promiseOutput = await Promise.all(items.map(async item => {
            const grants = await getSimpleGrants(item);
            if (grants.length) return grants;
            return [];
        }))
        items.push(...promiseOutput.flat());

        for (const item of items) {
            item.prepareActorData?.();

            const itemSource = (() => {
                if (item.type !== "condition") return item._source;

                const existing = actor.itemTypes.condition.find(c => c.slug === sluggify(item.name));
                if (existing) {
                    return existing._source;
                }
                return item._source
            })();

            const rules = item.prepareRuleElements();
            for (let i = 0; i < rules.length; i++) {
                const ruleSource = itemSource.system.rules[i];
                await rules[i].preCreate?.({ itemSource, ruleSource, pendingItems: outputSources, context });
            }
        }

        if (game.combat && outputSources.some(i => i.type === "condition" && sluggify(i.name) === "fainted")) {
            const combatant = game.combat.getCombatantByActor(actor)
            if (combatant && !combatant.defeated) await combatant.update({ defeated: true })
        }

        return super.createDocuments(outputSources, context);
    }

    /** @override */
    static async deleteDocuments(ids = [], context = {}) {
        ids = Array.from(new Set(ids));
        const actor = context.parent;
        if (actor) {
            const items = ids.flatMap((id) => actor.items.get(id) ?? []);

            for (const item of [...items]) {
                for (const rule of item.rules) {
                    await rule.preDelete?.({ pendingItems: items, context });
                }

                await processGrantDeletions(item, items);
            }
            if (game.combat && items.some(i => i.type === "condition" && i.slug === "fainted")) {
                const combatant = game.combat.getCombatantByActor(actor)
                if (combatant && combatant.defeated) await combatant.update({ defeated: false })
            }

            ids = Array.from(new Set(items.map((i) => i._id)).filter((id) => actor.items.has(id)));
        }
        return super.deleteDocuments(ids, context);
    }

    /** @override */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        this._source.system.rules = this._source.system.rules.filter((r) => !r.removeUponCreate);
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        for (const rule of this.rules) {
            await rule.preUpdate?.(changed);
        }

        await super._preUpdate(changed, options, user);
    }

    /** @override */
    _onCreate(data, options, userId) {
        super._onCreate(data, options, userId);
        if (!(this.actor && game.user.id === userId)) return;

        this.actor.reset();
        const actorUpdates = {};
        for (const rule of this.rules) {
            rule.onCreate?.(actorUpdates);
        }

        const updateKeys = Object.keys(actorUpdates);
        if (updateKeys.length > 0 && !updateKeys.every(k => k === "_id")) this.actor.update(actorUpdates);
    }

    /** @override */
    _onDelete(options, userId) {
        super._onDelete(options, userId);
        if (!(this.actor && game.user.id === userId)) return;

        const actorUpdates = {};
        for (const rule of this.rules) {
            rule.onDelete?.(actorUpdates);
        }

        const updateKeys = Object.keys(actorUpdates);
        if (updateKeys.length > 0 && !updateKeys.every(k => k === "_id")) this.actor.update(actorUpdates);
    }

    prepareRuleElements(options = {}) {
        if (!this.actor) throw new Error("PTU | Item must have an actor to prepare rule elements");

        return (this.rules = this.actor.canHostRuleElements ? RuleElements.fromOwnedItem(this, options) : []);
    }

    async refreshFromCompendium() {
        if (!this.isOwned) return ui.notifications.error("PTU | Item must be owned to refresh from compendium");

        if (!this.sourceId?.startsWith("Compendium.")) {
            console.warn("PTU | Item must be from a compendium to refresh from compendium");
            return;
        }

        const currentSource = this.toObject();
        const latestSource = (await fromUuid(this.sourceId))?.toObject();
        if (!latestSource) return ui.notifications.error("PTU | Could not find latest source for item");
        else if (latestSource.type !== this.type) return ui.notifications.error("PTU | Item type must match latest source type");

        const updatedImage = currentSource.img.endsWith(".svg") ? latestSource.img : currentSource.img;
        const updates = {
            img: updatedImage,
            system: latestSource.system,
        }

        if (this.type === "item") {
            // Preserve the current quantity
            const { quantity } = currentSource.data;
            updates.system.quantity = quantity;
        }

        await this.update(updates, { diff: false, recursive: false });
        ui.notifications.info(`PTU | Item ${this.name} updated from compendium`);
    }

    async use(options = {}) {

    }

    async sendToChat() {
        const tags = await (async () => {
            const tags = [];
            if (this.system.frequency) tags.push({ slug: "frequency", label: game.i18n.localize("PTU.Tags.Frequency"), value: this.system.frequency });
            if (this.system.range) tags.push({ slug: "range", label: game.i18n.localize("PTU.Tags.Range"), value: this.system.range });
            if (this.system.damageBase) tags.push({ slug: "db", label: game.i18n.localize("PTU.Tags.DB"), value: this.system.damageBase + " DB" });
            return tags;
        })();

        const flavor = await (async () => {
            const typeAndCategoryHeader = (() => {
                if (this.type !== "move") return null;

                const header = document.createElement("div");
                header.classList.add("header-bar");
                header.classList.add("type-category");

                const type = document.createElement("div");
                type.classList.add("type-img");

                const typeImg = document.createElement("img");
                typeImg.src = CONFIG.PTU.data.typeEffectiveness[this.system.type].images.bar;
                type.append(typeImg);

                const category = document.createElement("div");
                category.classList.add("type-img");

                const categoryImg = document.createElement("img");
                categoryImg.src = `/systems/ptu/static/css/images/categories/${this.system.category}.png`;
                category.append(categoryImg);

                header.append(category, type);
                return [header]
            })();

            const header = document.createElement("div");
            header.classList.add("header-bar");
            if (this.img) {
                header.append((() => {
                    const img = document.createElement("img");
                    img.classList.add("item-img", "item-icon");
                    img.src = this.img;
                    return img;
                })());
            }
            header.append((() => {
                const h3 = document.createElement("h3");
                h3.classList.add("action");
                h3.innerHTML = this.name;
                return h3;
            })());
            return [header, typeAndCategoryHeader ?? []]
                .flat()
                .map(e => (typeof e === "string" ? e : e.outerHTML))
                .join("");
        })();

        const referenceEffect = this.referenceEffect ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${foundry.utils.duplicate(this.referenceEffect)}]`, { async: true }) : null;

        const chatData = {
            user: game.user._id,
            item: this,
            tags,
            referenceEffect
        }

        ChatMessage.create({ content: await foundry.applications.handlebars.renderTemplate(`/systems/ptu/static/templates/chat/chat-items.hbs`, chatData), flavor, flags: { ptu: { origin: { item: this.uuid } } } })
    }
}

const PTUItemProxy = new Proxy(PTUItem, {
    construct(_target, args) {
        const subType = args[0]?.system?.subtype;
        if (subType && subType != "item") {
            return new CONFIG.PTU.Item.documentClasses[subType](...args);
        }

        return new CONFIG.PTU.Item.documentClasses[args[0].type](...args);
    }
})

export { PTUItem, PTUItemProxy }