class PTUTokenConfig extends foundry.applications.sheets.TokenConfig {
    /** @override */
    get template() {
        return "systems/ptu/static/templates/config/token/token-config.hbs";
    }

    get dimensionFromActorSize() {
        const actorSize = this.actor?.sizeClass ?? "Medium";
        return {
            "Tiny": 0.5,
            "Small": 1,
            "Medium": 1,
            "Large": 2,
            "Huge": 3,
            "Gigantic": 4
        }[actorSize] ?? 1;
    }

    /** @override */
    async getData(options = {}) {
        return {
            ...(await super.getData(options)),
            sizeLinkable: !!this.actor,
            linkToSizeTitle: this.token.flags.ptu.linkToActorSize ? "Unlink" : "Link",
            autoscaleTitle: this.token.flags.ptu.autoscale ? "Unlink" : "Link"
        }
    }

    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        if(this.token.flags.ptu.autoscale) {
            this._disableScale($html);
        }

        const linkToSizeButton = $html.find("a[data-action=toggle-link-to-size]");
        linkToSizeButton.on("click", async () => {
            await this.token.setFlag("ptu", "linkToActorSize", !this.token.flags.ptu.linkToActorSize)
            // await this.token.update({
            //     "flags.ptu.linkToActorSize": !!!this.token.flags.ptu.linkToActorSize,
            // });
            // this.#reestablishPrototype();
            await this.render();
        });

        const autoscaleButton = $html.find("a[data-action=toggle-autoscale]");
        autoscaleButton.on("click", async () => {
            await this.token.setFlag("ptu", "autoscale", !this.token.flags.ptu.autoscale)
            //await this.token.update({ "flags.ptu.autoscale": !!!this.token.flags.ptu.autoscale });
            // this.#reestablishPrototype();
            await this.render();
        });
    }

    _disableScale($html) {
        // If autoscale is disabled globally, keep form input enabled
        if(!game.settings.get("ptu", "tokens.autoscale")) return;

        const scale = $html.find(".form-group.scale");
        scale.addClass("children-disabled");

        const rangeInput = $html.find("input[type=range][name=scale]");
        rangeInput.prop("disabled", true);
        rangeInput.val(this.actor?.size === "Small" ? 0.6 : 1);
    }
}  

export { PTUTokenConfig };