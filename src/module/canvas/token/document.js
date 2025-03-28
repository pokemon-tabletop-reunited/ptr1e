class PTUTokenDocument extends TokenDocument {
    get scene() {
        return this.parent;
    }

    /** @override */
    _initialize() {
        this.auras = new Map();
        this._source.flags.ptu ??= {};
        this._source.flags.ptu.linkToActorSize ??= true;
        this._source.flags.ptu.autoscale ??= this._source.flags.ptu.linkToActorSize
            ? this._source.flags.ptu.autoscale ?? game.settings.get("ptu", "tokens.autoscale")
            : false;

        super._initialize();
    }

    /** @override */
    prepareBaseData() {
        super.prepareBaseData();

        this.auras.clear();

        if (!this.actor || !this.isEmbedded) return;

        // Dimensions and scale
        const linkToActorSize = this.flags.ptu?.linkToActorSize ?? true;

        const autoscaleDefault = game.settings.get("ptu", "tokens.autoscale");
        // Autoscaling is a secondary feature of linking to actor size
        const autoscale = linkToActorSize ? this.flags.ptu.autoscale ?? autoscaleDefault : false;
        this.flags.ptu = foundry.utils.mergeObject(this.flags.ptu ?? {}, { linkToActorSize, autoscale });

        this.disposition = this.actor.alliance
            ? {
                party: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
                opposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
            }[this.actor.alliance]
            : CONST.TOKEN_DISPOSITIONS.NEUTRAL;
    }

    /** @override */
    prepareDerivedData() {
        super.prepareDerivedData();
        if(!(this.actor && this.scene)) return;

        let changedScale = false;

        const { tokenOverrides } = this.actor.synthetics;
        this.name = tokenOverrides.name || this.name;
        
        if(tokenOverrides.texture) {
            this.texture.src = tokenOverrides.texture.src || this.texture.src;
            if("scaleX" in tokenOverrides.texture) {
                this.texture.scaleX = tokenOverrides.texture.scaleX;
                this.texture.scaleY = tokenOverrides.texture.scaleY;
                changedScale = true;
            }
            this.texture.tint = tokenOverrides.texture.tint || this.texture.tint;
        }

        this.alpha = tokenOverrides.alpha || this.alpha;

        if(tokenOverrides.light) {
            this.light = new foundry.data.LightData(tokenOverrides.light, {parent: this});
        }

        PTUTokenDocument.prepareSize(this, this.actor, changedScale);

        if(tokenOverrides.width) {
            this.width = tokenOverrides.width;
        }

        if(tokenOverrides.height) {
            this.height = tokenOverrides.height;
        }
    }

    static prepareSize(tokenDocument, actor, scaleOverridden = false) {
        if(!(actor && tokenDocument.flags.ptu.linkToActorSize)) return;
        
        const {width, height} = ((sizeClass) => {;
            switch (sizeClass) {
                case "Small": return { width: 1, height: 1 };
                case "Medium": return { width: 1, height: 1 };
                case "Large": return { width: 2, height: 2 };
                case "Huge": return { width: 3, height: 3 };
                case "Gigantic": return { width: 4, height: 4 };
                default: return { width: 1, height: 1 };
            }
        })(actor.sizeClass);

        tokenDocument.width = width;
        tokenDocument.height = height;

        if(game.settings.get("ptu", "tokens.autoscale") && !scaleOverridden && tokenDocument.flags?.ptu?.autoscale !== false) {
            const absoluteScale = actor.sizeClass === "Small" ? 0.6 : 1;
            const mirrorX = tokenDocument.texture.scaleX < 0 ? -1 : 1;
            const mirrorY = tokenDocument.texture.scaleY < 0 ? -1 : 1;
            tokenDocument.texture.scaleX = absoluteScale * mirrorX;
            tokenDocument.texture.scaleY = absoluteScale * mirrorY;
        }
    }

    /** Re-render token placeable if REs have ephemerally changed any visuals of this token */
    onActorEmbeddedItemChange() {
        if (!(this.isLinked && this.rendered && this.object?.visible)) return;

        this.object.drawEffects().then(() => {
            const preUpdate = this.toObject(false);
            this.reset();
            const postUpdate = this.toObject(false);
            const changes = foundry.utils.diffObject(preUpdate, postUpdate);

            if(Object.keys(changes).length > 0) {
                this._onUpdate(changes, {}, game.user.id);
            }

            if(this.combatant?.parent.active) ui.combat.render();
        })
        this.object.drawBars();
    }

    isFlanked() {
        return this.object?.isFlanked() ?? null;
    }
}

export { PTUTokenDocument }