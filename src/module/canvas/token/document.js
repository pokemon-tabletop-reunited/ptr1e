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
        this._source.flags.ptu.manuallyResized ??= false;

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

        const { tokenOverrides } = this.actor.synthetics;
        this.name = tokenOverrides.name || this.name;
        
        if(tokenOverrides.texture) {
            this.texture.src = tokenOverrides.texture.src || this.texture.src;
            if("scaleX" in tokenOverrides.texture) {
                this.texture.scaleX = tokenOverrides.texture.scaleX;
                this.texture.scaleY = tokenOverrides.texture.scaleY;
            }
            this.texture.tint = tokenOverrides.texture.tint || this.texture.tint;
        }

        this.alpha = tokenOverrides.alpha || this.alpha;

        if(tokenOverrides.light) {
            this.light = new foundry.data.LightData(tokenOverrides.light, {parent: this});
        }
    }

    /**
     * Check if the token has the correct size based on its actor's size class
     * and fix it if necessary (for existing tokens created with old size mappings)
     * @private
     */
    _checkAndFixTokenSize() {
        if (!this.actor || !this.flags.ptu?.linkToActorSize) return;

        // Don't override manual resizing
        if (this.flags.ptu.manuallyResized) return;

        const expectedSize = PTUTokenDocument.prepareSize(this, this.actor, false);
        if (!expectedSize) return;

        const currentWidth = this.width;
        const currentHeight = this.height;
        const currentScaleX = this.texture.scaleX;
        const currentScaleY = this.texture.scaleY;

        // Check if dimensions need updating
        const needsDimensionUpdate = currentWidth !== expectedSize.width || currentHeight !== expectedSize.height;
        const needsScaleUpdate = Math.abs(currentScaleX - expectedSize.scaleX) > 0.001 || Math.abs(currentScaleY - expectedSize.scaleY) > 0.001;

        if (needsDimensionUpdate || needsScaleUpdate) {
            // Use updateSource to properly update the token
            const updates = {};
            if (needsDimensionUpdate) {
                updates.width = expectedSize.width;
                updates.height = expectedSize.height;
            }
            if (needsScaleUpdate) {
                updates.texture = { scaleX: expectedSize.scaleX, scaleY: expectedSize.scaleY };
            }
            
            // Update the token source data
            this.updateSource(updates);
        }
    }

    /**
     * Public method to check and fix token size - can be called when scene loads
     * to correct existing tokens with wrong sizes
     */
    checkAndFixTokenSize() {
        this._checkAndFixTokenSize();
    }

    /**
     * Set a TokenData instance's dimensions from actor data. Static so actors can use for their prototypes
     */
    static prepareSize(tokenDocument, actor, overriden = false) {
        if(!(actor && tokenDocument.flags.ptu?.linkToActorSize)) return null;
        
        const {width, height} = ((sizeClass) => {
            switch (sizeClass) {
                case "Tiny": return { width: 0.5, height: 0.5 };
                case "Small": return { width: 1, height: 1 };
                case "Medium": return { width: 1, height: 1 };
                case "Large": return { width: 2, height: 2 };
                case "Huge": return { width: 3, height: 3 };
                case "Gigantic": return { width: 4, height: 4 };
                default: return { width: 1, height: 1 };
            }
        })(actor.sizeClass);

        const result = {
            width: tokenDocument.width,
            height: tokenDocument.height,
            scaleX: tokenDocument.texture.scaleX,
            scaleY: tokenDocument.texture.scaleY,
        };

        if (tokenDocument.width !== width || tokenDocument.height !== height) {
            result.width = width;
            result.height = height;
        }

        // Handle texture scaling
        if(game.settings.get("ptu", "tokens.autoscale") && !overriden && tokenDocument.flags?.ptu?.autoscale !== false) {
            const absoluteScale = actor.sizeClass === "Small" ? 0.6 : 1;
            const mirrorX = tokenDocument.texture.scaleX < 0 ? -1 : 1;
            const mirrorY = tokenDocument.texture.scaleY < 0 ? -1 : 1;
            const newScaleX = absoluteScale * mirrorX;
            const newScaleY = absoluteScale * mirrorY;
            
            if (Math.abs(tokenDocument.texture.scaleX - newScaleX) > 0.001 || 
                Math.abs(tokenDocument.texture.scaleY - newScaleY) > 0.001) {
                result.scaleX = newScaleX;
                result.scaleY = newScaleY;
            }
        }

        return result;
    }

    /** @override */
    async _preCreate(data, options, user) {
        const result = await super._preCreate(data, options, user);
        if (result === false) return false;

        const flags = {
            autoscale: !!this.flags.ptu.autoscale,
            linkToActorSize: !!this.flags.ptu.linkToActorSize,
        };
        
        if ('flags' in data && typeof data.flags === "object" && data.flags && 'ptu' in data.flags && typeof data.flags.ptu === "object" && data.flags.ptu) {
            if ('autoscale' in data.flags.ptu) {
                flags.autoscale = !!data.flags.ptu.autoscale;
            }
            if ('linkToActorSize' in data.flags.ptu) {
                flags.linkToActorSize = !!data.flags.ptu.linkToActorSize;
            }
        }

        // Only apply automatic sizing if not manually resized
        if (!this.flags.ptu.manuallyResized) {
            const size = PTUTokenDocument.prepareSize(this, this.actor, false);
            if (size) {
                const { width, height, scaleX, scaleY } = size;
                if (width !== this.width || height !== this.height) {
                    this.updateSource({ width, height });
                }
                if (scaleX !== this.texture.scaleX || scaleY !== this.texture.scaleY) {
                    this.updateSource({ texture: { scaleX, scaleY } });
                }
            }
        }
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        const allowed = await super._preUpdate(changed, options, user);
        if (allowed === false) return false;

        const flags = {
            autoscale: !!this.flags.ptu.autoscale,
            linkToActorSize: !!this.flags.ptu.linkToActorSize,
        };
        
        if ('flags' in changed && typeof changed.flags === "object" && changed.flags && 'ptu' in changed.flags && typeof changed.flags.ptu === "object" && changed.flags.ptu) {
            if ('autoscale' in changed.flags.ptu) {
                flags.autoscale = !!changed.flags.ptu.autoscale;
            }
            if ('linkToActorSize' in changed.flags.ptu) {
                flags.linkToActorSize = !!changed.flags.ptu.linkToActorSize;
            }
        }

        // Only apply automatic scaling if not manually resized
        if (!this.flags.ptu.manuallyResized) {
            const size = PTUTokenDocument.prepareSize(this, this.actor, false);
            if (size) {
                const { scaleX, scaleY } = size;
                if (scaleX !== this.texture.scaleX || scaleY !== this.texture.scaleY) {
                    changed.texture = changed.texture || {};
                    changed.texture.scaleX = scaleX;
                    changed.texture.scaleY = scaleY;
                }
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
        
        // Detect manual resizing and mark the token as manually resized
        if (('width' in changed || 'height' in changed) && 
            !options.autoResize && 
            !options.fromActorSize && 
            userId === game.user.id &&
            !this.flags.ptu.manuallyResized) {
            
            // Set the flag directly without triggering another update
            this.flags.ptu.manuallyResized = true;
        }
    }
}

export { PTUTokenDocument }