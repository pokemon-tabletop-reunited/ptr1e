export const RenderChatMessage = {
    listen() {
        Hooks.on("renderChatMessageHTML", async (message, html) => {
            // Only handle PTU chat messages
            if (!(message instanceof CONFIG.PTU.ChatMessage.documentClass)) return;

            const $html = $(html);

            // Add tooltipster to tooltip tags
            $html.find('.tag.tooltip').tooltipster({
                theme: `tooltipster-shadow ball-themes default`,
                position: 'top'
            });

            // Handle specific message types
            if (message instanceof CONFIG.PTU.ChatMessage.documentClasses.damage) {
                await message.renderDamageHTML($html);
            } else if (message instanceof CONFIG.PTU.ChatMessage.documentClasses.attack) {
                await message.renderAttackHTML($html);
            }

            // Handle button actions for base ChatMessagePTU
            $html.find(".buttons .button[data-action]").on("click", async event => {
                event.preventDefault();

                const $button = $(event.currentTarget);
                const action = $button.data("action");

                switch (action) {
                    case "damage": {
                        const { actor } = message;
                        if (!actor) return;
                        if (!game.user.isGM && !actor.isOwner) return;

                        const attack = message.attack;
                        if (!attack) return;

                        const options = actor.getRollOptions(["all", "attack-roll"]);

                        const rollArgs = { event, options, rollResult: message.context.rollResult ?? null, };

                        return attack.damage?.(rollArgs);
                    }
                    case "revert-damage": {
                        const appliedDamageFlag = message.flags.ptu?.appliedDamage;
                        if (!appliedDamageFlag) return;

                        const actorOrToken = await fromUuid(appliedDamageFlag.uuid);
                        const actor = actorOrToken.actor ?? (actorOrToken instanceof Actor) ? actorOrToken : null;
                        if (!actor) return;
                        await actor.undoDamage(appliedDamageFlag);

                        $html.find("span.statements").addClass("reverted");
                        $html.find(".buttons .button[data-action='revert-damage']").remove();
                        return await message.update({ "flags.ptu.appliedDamage.isReverted": true });
                    }
                }
            });

            // Handle reverted damage display
            if (message.flags.ptu?.appliedDamage && message.flags.ptu.appliedDamage?.isReverted) {
                $html.find("span.statements").addClass("reverted");
                $html.find(".buttons .button[data-action='revert-damage']").remove();
            }

            // Handle IWR tooltips
            if (message.flags.ptu?.appliedDamage) {
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

            // Activate listeners for this message
            message.activateListeners($html);
        });
    }
}; 