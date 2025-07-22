import { sluggify } from "../../util/misc.js";
import { extractApplyEffects, extractEphemeralEffects } from "../rules/helpers.js";
import { DamageRoll } from "../system/damage/roll.js";
import { ChatMessagePTU } from "./base.js";

class DamageMessagePTU extends ChatMessagePTU {

    get outcomes() {
        return this.flags?.ptu?.context?.outcomes ?? null;
    }

    async renderDamageHTML($html) {
        const outcomes = this.outcomes;
        if (!outcomes) return await this._renderNoneTargetDamage($html);

        if (Object.values(this.outcomes).some(o => o == "crit-hit")) {
            const $el = $html.find(".dice-shadow.crit");
            if ($el.hasClass("hidden")) $el.removeClass("hidden");
        }

        return await this._renderTargetDamage($html);
    }

    async _renderNoneTargetDamage($html) {
        if (this.flags?.ptu?.context?.damageApplied === true) return $html;

        const $last = $html.find(".dice-roll").last();
        const $parent = $last.parent();

        const $content = $("<div></div>")
            .addClass("flavor-text")
            .addClass("pb-1")
            .addClass("pt-1")
            .append(
                $("<div></div>")
                    .addClass("message-buttons")
                    .append(
                        $("<button></button>")
                            .addClass("button")
                            .attr("mode", "full")
                            .attr("title", game.i18n.localize("PTU.Action.Apply"))
                            .text(game.i18n.localize("PTU.Action.Apply"))
                            .prepend(
                                $("<i></i>")
                                    .addClass("fas fa-heart-broken")
                            )
                            .click(async (event) => {
                                event.preventDefault();
                                const $el = $(event.currentTarget);
                                const mode = $el.data("mode");

                                const targets = (() => {
                                    if (this.targets) return this.targetsData ??= this.targets;
                                    return this.targetsData ??= game.user.targets.size > 0 ? [...game.user.targets] : (canvas.tokens.controlled ?? []);
                                })();
                                return applyDamageFromMessage({ message: this, targets, mode, promptModifier: event.shiftKey })
                            })
                    )
            );

        $parent.append($content);

        return $html;
    }

    async _renderTargetDamage($html) {
        if (!this.targets?.length) return $html;

        const $content = $html.find(".message-content");

        this.targetsData ??= this.targets;

        const damageHTML = await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/damage-selector.hbs", { targets: this.targetsData });

        const $headerSpan = $("<span></span>")
            .addClass("flavor-text")
            .append(
                $("<div></div>")
                    .addClass("header-bar")
                    .addClass("pb-1")
                    .addClass("pt-1")
                    .append(
                        $("<h3></h3>")
                            .addClass("action sub-action")
                            .text(game.i18n.localize("PTU.Action.DamageSelector"))
                    )
            )

        const $damageContent = $("<div></div>")
            .addClass("damage-content")
            .html(damageHTML);

        this._applyListeners($damageContent);

        $content.append([$headerSpan, $damageContent]);

        return $html;
    }

    async _updateSelectors() {
        const $damageContent = this.element.find(".damage-content");
        const damageHTML = await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/damage-selector.hbs", { targets: this.targetsData });
        $damageContent.html(damageHTML);

        this._applyListeners($damageContent);
    }

    _applyListeners($html) {
        $html.find(".mon-list-item").each((i, el) => {
            const $el = $(el);
            if ($el.hasClass("disabled")) return;

            $el.find(".hit .fa-certificate").click(async () => {
                const uuid = $el.data("uuid");
                const target = this.targetsData.find(t => t.actor.uuid === uuid);
                if (!target) return;
                target.outcome = "miss";
                await this.update({
                    [`flags.ptu.context.outcomes.${target.actor.id}`]: "miss",
                })
            })
            $el.find(".crit .fa-crosshairs").click(async () => {
                const uuid = $el.data("uuid");
                const target = this.targetsData.find(t => t.actor.uuid === uuid);
                if (!target) return;
                target.outcome = "hit";
                await this.update({
                    [`flags.ptu.context.outcomes.${target.actor.id}`]: "hit",
                })
            })
            $el.find(".hit .fa-times-circle").click(async () => {
                const uuid = $el.data("uuid");
                const target = this.targetsData.find(t => t.actor.uuid === uuid);
                if (!target) return;
                target.outcome = "hit";
                await this.update({
                    [`flags.ptu.context.outcomes.${target.actor.id}`]: "hit",
                })
            })
            $el.find(".crit .fa-times-circle").click(async () => {
                const uuid = $el.data("uuid");
                const target = this.targetsData.find(t => t.actor.uuid === uuid);
                if (!target) return;
                target.outcome = "crit-hit";
                await this.update({
                    [`flags.ptu.context.outcomes.${target.actor.id}`]: "crit-hit",
                })
            })

            $el.find(".tooltip").tooltipster({
                theme: `tooltipster-shadow ball-themes default`
            })
        });
        $html.find(".button").click(async (event) => {
            event.preventDefault();
        });

        $html.find(".applicators i.tooltip").click(async (event) => {
            event.preventDefault();
            const $el = $(event.currentTarget);
            const uuid = $el.closest(".mon-list-item[data-uuid]").data("uuid");
            const mode = $el.data("mode");

            const target = this.targetsData.find(t => t.actor.uuid === uuid);
            if (!target) return;
            if (target.outcome === "miss" || target.outcome === "crit-miss") return ui.notifications.info(game.i18n.localize("PTU.Notifications.CannotApplyOnMiss"));

            return applyDamageFromMessage({ message: this, targets: [target], mode, promptModifier: event.shiftKey })
        });

        $html.find(".message-buttons .button[data-mode]").click(async (event) => {
            event.preventDefault();
            const $el = $(event.currentTarget);
            const mode = $el.data("mode");

            const targets = this.targetsData.filter(target => target.outcome !== "miss" && target.outcome !== "crit-miss");
            return applyDamageFromMessage({ message: this, targets, mode, promptModifier: event.shiftKey })
        });
    }
}

async function applyDamageFromMessage({ message, targets, mode = "full", addend = 0, promptModifier = false, skipIWR = false }) {
    if (promptModifier) return shiftAdjustDamage(message, targets, mode);

    const [effectiveness, multiplier] = getMAFromMode(mode);

    const originAttackOptions = message.flags.ptu.attack ?? {};
    const originItem = (await fromUuid(originAttackOptions.actor))?.items.get(originAttackOptions.id) ?? null;
    const itemDomains = [];
    if (originItem) {
        itemDomains.push(
            `${originItem.id}-damage-received`,
            `${originItem.slug}-damage-received`,
        )
        if(originItem.type === "move") {
            itemDomains.push(
                `${originItem.system.category.toLocaleLowerCase(game.i18n.lang)}-damage-received`,
                `${originItem.system.type.toLocaleLowerCase(game.i18n.lang)}-damage-received`,
                `${sluggify(originItem.system.frequency)}-damage-received`,
            )
        }
    }

    const messageRollOptions = message.flags.ptu.context?.options ?? [];
    const originRollOptions = messageRollOptions
        .filter(o => o.startsWith("self:"))
        .map(o => o.replace(/^self/, "origin"));

    for (const token of targets) {
        if (!token.actor) continue;

        const rollIndex = token.outcome == "crit-hit" ? 1 : 0;

        const roll = message.rolls.at(rollIndex);
        if (!(roll instanceof DamageRoll)) return ui.notifications.error(game.i18n.localize("PTU.Notifications.InvalidRoll"));

        const damage = {
            total: (multiplier * roll.total) + addend,
            totalCritImmune: (multiplier * roll.critImmuneTotal) + addend,
        }

        const domains = ["damage-received", ...itemDomains];

        const ephemeralEffects = [
            ...await extractEphemeralEffects({
                affects: "target",
                origin: message.actor,
                target: token.actor,
                item: message.item,
                domains,
                options: messageRollOptions
            }),
            // Ephemeral Effects on the target that it wishes to apply to itself
            // F.e. Type Brace
            ...await extractEphemeralEffects({
                affects: "origin",
                origin: message.actor,
                target: token.actor,
                item: message.item,
                domains,
                options: messageRollOptions
            })
        ];

        const applyEffectsTarget = Object.values([
            ...await extractApplyEffects({
                affects: "target",
                origin: message.actor,
                target: token.actor,
                item: message.item,
                domains,
                options: messageRollOptions,
                roll: Number(message.flags.ptu.context.accuracyRollResult ?? 0)
            }),
        ].reduce((a, b) => {
            if (!a[b.slug]) a[b.slug] = b;
            return a;
        }, {}));

        const contextClone = token.actor.getContextualClone(originRollOptions, ephemeralEffects);
        const applicationRollOptions = new Set([
            ...messageRollOptions.filter(o => !/^(?:self|target):/.test(o)),
            ...originRollOptions,
            ...contextClone.getSelfRollOptions()
        ]);

        await contextClone.applyDamage({
            damage,
            token,
            item: message.item,
            effectiveness,
            rollOptions: applicationRollOptions,
            skipIWR
        });

        if (applyEffectsTarget.length > 0) {
            const newItems = await contextClone.createEmbeddedDocuments("Item", applyEffectsTarget);
            if (newItems.length > 0)
                await ChatMessage.create({
                    content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/effects-applied.hbs", { target: contextClone, effects: newItems }),
                    speaker: ChatMessage.getSpeaker({ actor: contextClone }),
                    whisper: ChatMessage.getWhisperRecipients("GM")
                })
        }
    }

    const applyEffectsOrigin = Object.values([
        ...await extractApplyEffects({
            affects: "origin",
            origin: message.actor,
            target: message.actor,
            item: message.item,
            domains: ["damage-dealt", ...itemDomains.map(d => d.replace(/-received$/, "-dealt"))],
            options: messageRollOptions,
            roll: Number(message.flags.ptu.context.accuracyRollResult ?? 0)
        }),
    ].reduce((a, b) => {
        if (!a[b.slug]) a[b.slug] = b;
        return a;
    }, {}));

    if (applyEffectsOrigin.length > 0) {
        const newItems = await message.actor.createEmbeddedDocuments("Item", applyEffectsOrigin);
        if (newItems.length > 0)
            await ChatMessage.create({
                content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/damage/effects-applied.hbs", { target: message.actor, effects: newItems }),
                speaker: ChatMessage.getSpeaker({ actor: message.actor }),
                whisper: ChatMessage.getWhisperRecipients("GM")
            })
    }
}

function getMAFromMode(mode) {
    switch (mode) {
        case "full": return [1, 1];
        case "half": return [1, 0.5];
        case "weak": return [2, 1];
        case "resist": return [0.5, 1];
        case "flat": return [-1, 1];
    }
}

async function shiftAdjustDamage(message, targets, mode) {
    const [effectiveness, multiplier] = getMAFromMode(mode);
    new Dialog({
        title: game.i18n.localize("PTU.UI.ShiftModifyDamageTitle"),
        content: `<form>
                <div class="form-group">
                    <label>${game.i18n.localize("PTU.UI.ShiftModifyDamageLabel")}</label>
                    <input type="number" name="modifier" value="" placeholder="0">
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("PTU.UI.ShiftModifySkipIWRLabel")}</label>
                    <input type="checkbox" name="skipIWR" value="" placeholder="0">
                </div>
                </form>
                <script type="text/javascript">
                $(function () {
                    $(".form-group input").focus();
                });
                </script>`,
        buttons: {
            ok: {
                label: "Ok",
                callback: async ($dialog) => {
                    // In case of healing, multipler will have negative sign. The user will expect that positive
                    // modifier would increase healing value, while negative would decrease.
                    const adjustment = (Number($dialog.find("[name=modifier]").val()) || 0) * Math.sign(multiplier);
                    const skip = $dialog.find("[name=skipIWR]").is(":checked");
                    applyDamageFromMessage({
                        message,
                        targets,
                        mode,
                        addend: adjustment,
                        promptModifier: false,
                        skipIWR: skip
                    });
                },
            },
        },
        default: "ok",
        close: () => {
        },
    }).render(true);
}

export { DamageMessagePTU, applyDamageFromMessage }