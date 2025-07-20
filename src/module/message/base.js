class ChatMessagePTU extends ChatMessage {
    constructor(data = {}, context = {}) {
        data.flags = foundry.utils.mergeObject(foundry.utils.expandObject(data.flags ?? {}), { core: {}, ptu: {} });
        super(data, context);
    }

    get actor() {
        const attack = this.flags.ptu.attack;
        if (!attack) return null;
        const actorUUID = "actor" in attack ? attack.actor : null;
        if (!actorUUID) return null;

        const match = /^Actor\.(\w+)$/.exec(actorUUID ?? "") ?? [];
        const actor = game.actors.get(match[1] ?? "");

        return actor ?? null;
    }

    get target() {
        const context = this.flags.ptu.context;
        if (!context) return null;
        const targetUUID = "target" in context ? context.target?.token : null;
        if (!targetUUID) return null;

        const match = /^Scene\.(\w+)\.Token\.(\w+)$/.exec(targetUUID ?? "") ?? [];
        const scene = game.scenes.get(match[1] ?? "");
        const token = scene?.tokens.get(match[2] ?? "");
        const actor = token?.actor;

        return actor ? { actor, token } : null;
    }

    get targets() {
        const context = this.flags.ptu.context;
        if (!context) return null;
        const targets = context.targets ?? [];
        if (!targets) return null;

        return targets.map(target => {
            const match = /^Scene\.(\w+)\.Token\.(\w+)$/.exec(target.token ?? "") ?? [];
            const scene = game.scenes.get(match[1] ?? "");
            const token = scene?.tokens.get(match[2] ?? "");
            const actor = token?.actor;

            const outcome = target.outcome ? target.outcome : this.outcomes?.[actor?.id ?? ""] ?? null;

            return actor && token ? { actor, token, dc: target.dc, outcome } : null;
        }).filter(t => t);
    }

    get context() {
        const context = this.flags.ptu.context;
        return context ?? null;
    }

    get isCheckRoll() {
        return this.rolls[0] instanceof CONFIG.PTU.Dice.rollDocuments.check;
    }

    get item() {
        const attack = this.attack;
        if (attack?.item) return attack.item;

        const context = this.context;
        if (context?.item) {
            const match = /^Actor\.(\w+)\.Item\.(\w+)$/.exec(context.item) ?? [];
            const actor = game.actors.get(match[1] ?? "");
            const item = actor?.items.get(match[2] ?? "");
            return item ?? null;
        }

        return null;
    }

    get attack() {
        const actor = this.actor;
        if (!actor?.system.attacks) return null;

        const attack = actor.system.attacks.get(this.flags.ptu.attack.id);
        return attack ?? null;
    }

    get token() {
        if (!game.scenes) return null;
        const sceneId = this.speaker.scene ?? "";
        const tokenId = this.speaker.token ?? "";
        return game.scenes.get(sceneId)?.tokens.get(tokenId) ?? null;
    }

    get outcome() {
        return this.rolls[0]?.options?.outcome ?? null;
    }

    get outcomes() {
        return this.flags.ptu?.context?.outcomes ?? null;
    }

    getRollData() {
        const { actor, item } = this;
        return { ...actor?.getRollData(), ...item?.getRollData() };
    }

    /** @override */
    async getHTML() {
        // Use renderHTML() instead of deprecated getHTML()
        const html = await super.renderHTML();
        const $html = $(html);

        const message = this;

                $html.find('.tag.tooltip').tooltipster({
			theme: `tooltipster-shadow ball-themes default`,
			position: 'top'
		});



        $html.find(".buttons .button[data-action]").on("click", async event => {
            event.preventDefault();

            const $button = $(event.currentTarget);
            const action = $button.data("action");

            switch (action) {
                case "damage": {
                    const { actor } = this;
                    if (!actor) return;
                    if (!game.user.isGM && !actor.isOwner) return;

                    const attack = message.attack;
                    if (!attack) return;

                    const options = actor.getRollOptions(["all", "attack-roll"]);

                    const rollArgs = { event, options, rollResult: this.context.rollResult ?? null, };

                    return attack.damage?.(rollArgs);
                }
                case "revert-damage": {
                    const appliedDamageFlag = message.flags.ptu?.appliedDamage;
                    if (!appliedDamageFlag) return;

                    const actorOrToken = await fromUuid(appliedDamageFlag.uuid);
                    const actor = actorOrToken.actor ?? (actorOrToken instanceof Actor) ? actorOrToken : null;
                    if (!actor) return;
                    await actor.undoDamage(appliedDamageFlag)

                    $html.find("span.statements").addClass("reverted");
                    $html.find(".buttons .button[data-action='revert-damage']").remove();
                    return await message.update({ "flags.ptu.appliedDamage.isReverted": true });
                }
            }
        })

        if (this.flags.ptu?.appliedDamage && this.flags.ptu.appliedDamage?.isReverted) {
            $html.find("span.statements").addClass("reverted");
            $html.find(".buttons .button[data-action='revert-damage']").remove();
        }

        if (this.flags.ptu?.appliedDamage) {
            const iwrInfo = $html.find(".iwr")[0];
            if (iwrInfo) {
                const iwrApplications = (() => {
                    try {
                        const parsed = JSON.parse(iwrInfo?.dataset.applications ?? "null");
                        return Array.isArray(parsed) &&
                            parsed.every(
                                (a) =>
                                    a instanceof Object &&
                                    "category" in a &&
                                    typeof a.category === "string" &&
                                    "type" in a &&
                                    typeof a.type === "string" &&
                                    (
                                        (
                                            "adjustment" in a &&
                                            typeof a.adjustment === "number"
                                        )
                                        ||
                                        (
                                            "modifier" in a &&
                                            typeof a.modifier === "number"
                                        )
                                    )
                            )
                            ? parsed
                            : null;
                    } catch {
                        return null;
                    }
                })();
    
                if (iwrApplications) {
                    $(iwrInfo).tooltipster({
                        theme: "crb-hover",
                        maxWidth: 400,
                        content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/chat/iwr-breakdown.hbs", {
                            applications: iwrApplications,
                        }),
                        contentAsHTML: true,
                    });
                }
            }
        }

        this.activateListeners($html);

        return $html;
    }

    activateListeners($html) {
        // Add click handler for dice formula to toggle dice tooltip in Foundry v13
        const $diceFormulas = $html.find('.dice-formula');
        
        $diceFormulas.off('click').on('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            // Debounce - prevent rapid clicks and turning off the tooltip right away
            if ($(this).data('clicking')) return;
            $(this).data('clicking', true);
            setTimeout(() => $(this).data('clicking', false), 200);
            
            // Find the dice-tooltip in the same dice-result
            const $tooltip = $(this).siblings('.dice-tooltip');
            
            if ($tooltip.length > 0) {
                $tooltip.toggleClass('expanded-roll');
                console.log('Toggled dice tooltip, now expanded:', $tooltip.hasClass('expanded-roll'));
            }
        });

        $html.find("button.use").on("click", async event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const item = await fromUuid(this.flags.ptu.origin.item);
            if (!item) return;

            await item?.use();
        });
        $html.find("button.apply-capture").on("click", async event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const item = await fromUuid(this.flags.ptu.origin.uuid);
            if (!item) return;

            await item?.applyCapture(this.flags.ptu.context);
        });
        $html.find("button.contested-check").on("click", async event => {
            event.preventDefault();
            event.stopImmediatePropagation();

            const total = this.rolls[0]?.total;
            const target = this.targets.find(t => t.actor.isOwner);
            if (!target || total === undefined || total === null) return;

            const {actor, token} = this.flags.ptu.origin;
            const tokenDocument = await fromUuid(token);

            const skill = this.context.skill;
            const skillOptions = Object.keys(target.actor.system.skills).sort().map(s=>({ value: s, label: `PTU.Skills.${s}` }));

            const dialog = new Dialog({
                title: game.i18n.format("PTU.Dialog.ContestedCheck.Title", {name: target.actor.name, skill: game.i18n.localize(`PTU.Skills.${skill}`)}),
                content: await foundry.applications.handlebars.renderTemplate("systems/ptu/static/templates/apps/contested-check.hbs", {
                    skill,
                    skillOptions,
                }),
                buttons: {
                    submit: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("PTU.Dialog.ContestedCheck.Submit"),
                        callback: async ($html, event) => {
                            const formData = $html.find("select").map((_, select) => ({ name: select.name, value: select.value })).get().reduce((obj, { name, value }) => {
                                obj[name] = value;
                                return obj;
                            }, {});

                            const contestedSkill = target.actor.attributes.skills[formData.skill];
                            if(!contestedSkill) return;
                            
                            await contestedSkill.roll({
                                event,
                                targets: [tokenDocument.object],
                                dc: {
                                    slug: game.i18n.format("PTU.Check.SkillCheck", { skill: game.i18n.localize(`PTU.Skills.${skill}`) }),
                                    value: total,
                                    uuids: {
                                        actor: actor,
                                        token: token
                                    }
                                },
                                callback: async (rolls, targets, msg, event) => {
                                    const contestedTotal = rolls[0]?.total;
                                    if(contestedTotal === undefined || contestedTotal === null) return;

                                    const outcome = total > contestedTotal ? "hit" : "miss";

                                    this.rolls[0].options.outcomes = {
                                        [target.actor.uuid]: outcome
                                    };
                                    this.rolls[0].options.targets = [
                                        {
                                            actor: target.actor.uuid,
                                            token: target.token.uuid,
                                            outcome: outcome,
                                            dc: {
                                                slug: game.i18n.format("PTU.Check.SkillCheck", { skill: game.i18n.localize(`PTU.Skills.${formData.skill}`) }),
                                                value: contestedTotal,
                                            }
                                        }
                                    ]

                                    await this.update({
                                        "flags.ptu.context.outcomes": {
                                            [target.actor.uuid]: outcome
                                        },
                                        "rolls": [JSON.stringify(this.rolls[0])]
                                    })
                                }
                            })
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("PTU.Dialog.ContestedCheck.Cancel"),
                    }
                },
                default: "submit"
            })
            dialog.render(true);
        });
    }
}

export { ChatMessagePTU, PTUChatMessageProxy }

const PTUChatMessageProxy = new Proxy(ChatMessagePTU, {
    construct(_target, args) {
        const rolls = args[0].rolls;
        const type = args[0].flags?.ptu?.context?.type;
        if (type == "attack-roll") return new CONFIG.PTU.ChatMessage.documentClasses.attack(...args);
        if (type == "damage-roll") return new CONFIG.PTU.ChatMessage.documentClasses.damage(...args);

        return new ChatMessagePTU(...args);
    }
})