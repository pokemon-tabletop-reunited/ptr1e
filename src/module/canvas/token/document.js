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

        // V13 Compatibility: Only apply auto-sizing if not manually resized
        if (this._shouldApplyAutoSizing()) {
            PTUTokenDocument.prepareSize(this, this.actor, changedScale);
        }
    }

    /**
     * Determine whether auto-sizing should be applied to this token
     * V13 Compatibility: Only block auto-sizing during explicit manual resize operations
     * @returns {boolean}
     * @private
     */
    _shouldApplyAutoSizing() {
        // Skip if not linked to actor size
        if (!this.flags.ptu?.linkToActorSize) return false;
        
        // Skip if we don't have an actor
        if (!this.actor) return false;

        // V13 Compatibility: Only skip if token was manually resized recently via user interaction
        // This allows initial sizing and actor-based resizing while preventing conflicts with manual resizing
        if (this._manuallyResized) return false;

        return true;
    }

    static prepareSize(tokenDocument, actor, overriden = false) {
        if(!(actor && tokenDocument.flags.ptu?.linkToActorSize)) return;
        
        const {width, height} = ((sizeClass) => {
            switch (sizeClass) {
                case "Small": return { width: 0.5, height: 0.5 };
                case "Medium": return { width: 1, height: 1 };
                case "Large": return { width: 2, height: 2 };
                case "Huge": return { width: 3, height: 3 };
                case "Gigantic": return { width: 4, height: 4 };
                default: return { width: 1, height: 1 };
            }
        })(actor.sizeClass);

        // V13 Compatibility: Use safer property assignment that respects Foundry's internal tracking
        const currentWidth = tokenDocument.width;
        const currentHeight = tokenDocument.height;
        
        // Only update dimensions if they actually changed to avoid triggering unnecessary updates
        if (currentWidth !== width || currentHeight !== height) {
            // Mark that we're doing auto-sizing to prevent it being flagged as manual
            tokenDocument._autoSizing = true;
            tokenDocument.width = width;
            tokenDocument.height = height;
            // Clear the flag after assignment
            delete tokenDocument._autoSizing;
        }

        // Handle texture scaling
        if(game.settings.get("ptu", "tokens.autoscale") && !overriden && tokenDocument.flags?.ptu?.autoscale !== false) {
            const absoluteScale = actor.sizeClass === "Small" ? 0.6 : 1;
            const mirrorX = tokenDocument.texture.scaleX < 0 ? -1 : 1;
            const mirrorY = tokenDocument.texture.scaleY < 0 ? -1 : 1;
            const newScaleX = absoluteScale * mirrorX;
            const newScaleY = absoluteScale * mirrorY;
            
            // V13 Compatibility: Only update scale if it actually changed
            if (Math.abs(tokenDocument.texture.scaleX - newScaleX) > 0.001 || 
                Math.abs(tokenDocument.texture.scaleY - newScaleY) > 0.001) {
                tokenDocument.texture.scaleX = newScaleX;
                tokenDocument.texture.scaleY = newScaleY;
            }
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



    /** @override */
    _onUpdate(changed, options, userId) {
        super._onUpdate(changed, options, userId);
        
        // V13 Compatibility: Only block auto-sizing for explicit manual resize operations
        // Check if this is a manual resize from token config or drag handles (not auto-sizing)
        if (('width' in changed || 'height' in changed) && 
            !options.autoResize && 
            !options.fromActorSize && 
            !this._autoSizing &&
            userId === game.user.id) {
            
            // Mark that this was a manual resize to prevent auto-sizing conflicts
            this._manuallyResized = true;
            
            // Clear the flag after a short delay to allow future auto-sizing
            setTimeout(() => {
                delete this._manuallyResized;
            }, 2000);
        }
    }
}

export { PTUTokenDocument }