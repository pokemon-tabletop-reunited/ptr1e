import { ChatMessagePTU } from "./base.js";

class AttackMessagePTU extends ChatMessagePTU {
    async renderAttackHTML($html) {
        const resolved = this.flags?.ptu?.resolved ?? null;
        if(!resolved) return await this._renderButton($html);

        return $html;
    }

    async _renderButton($html) {
        if(!this.attack?.item) return $html;
        return this.attack.item.isDamaging ? await this._renderDamageButton($html) : await this._renderUseButton($html);
    }

    async _renderDamageButton($html) {
        const $last = $html.find(".dice-roll").last();
        const $parent = $last.parent();

        const $content = $("<div></div>")
            .addClass("flavor-text")
            .addClass("pb-1")
            .append(
                $("<div></div>")
                .addClass("message-buttons")
                .append(
                    $("<button></button>")
                        .addClass("button")
                        .data("action", "damage")
                        .attr("title", game.i18n.localize("PTU.Action.Damage"))
                        .text(game.i18n.localize("PTU.Action.Damage"))
                        .prepend(
                            $("<i></i>")
                                .addClass("fas fa-heart-broken")
                        )
                        .click(this._executeDamage.bind(this))
                )
            );

        $parent.append($content);
        return $html;
    }

    async _renderUseButton($html) {
        const $last = $html.find(".dice-roll").last();
        const $parent = $last.parent();

        const $content = $("<div></div>")
            .addClass("flavor-text")
            .addClass("pb-1")
            .append(
                $("<div></div>")
                .addClass("message-buttons")
                .append(
                    $("<button></button>")
                        .addClass("button")
                        .data("action", "damage")
                        .attr("title", game.i18n.localize("PTU.Action.Use"))
                        .text(game.i18n.localize("PTU.Action.Use"))
                        .prepend(
                            $("<i></i>")
                                .addClass("fas fa-sparkles")
                        )
                        .click(() => this.attack.item.use({targets: this.targets}))
                )
            );

        $parent.append($content);
        return $html;
    }

    async _executeDamage(event) {
        event.preventDefault();

        const params = {
            event,
            options: this.context.options ?? [],
            rollResult: this.context.rollResult ?? null,
            actor: this.actor,
            targets: this.targets,
            callback: () => {
                const resolved = this.targets.length > 0
                ? game.settings.get("ptu", "autoRollDamage")
                : false;
                if(resolved != this.flags.ptu.resolved) {
                    return this.update({
                        "flags.ptu.resolved": resolved,
                    })
                }
            }
        }

        return await this.attack?.damage(params)
    }
}

export { AttackMessagePTU }