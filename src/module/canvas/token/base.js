import { BaseEffectPTU } from '../../item/effect-types/base.js';
import { measureDistanceCuboid } from '../helpers.js';

class PTUToken extends foundry.canvas.placeables.Token {

    /** @override _drawBar(k) to also draw PTR variants of normal resource bars (such as temp health) */
    _drawBar(number, bar, data) {
        if (!canvas.dimensions) return;

        const actor = this.document.actor;

        if (!(data.attribute.includes("health") && actor?.attributes.health)) {
            return super._drawBar(number, bar, data);
        }

        const { current, max, temp, injuries } = actor.attributes.health ?? {};
        const healthPercent = Math.clamp(current, 0, max) / max;

        // Compute the color based on health percentage, this formula is the one core foundry uses
        const black = 0x000000;
        const color = number
            ? PIXI.utils.rgb2hex([0.5 * healthPercent, 0.7 * healthPercent, 0.5 + healthPercent / 2])
            : PIXI.utils.rgb2hex([1 - healthPercent / 2, healthPercent, 0]);
        const bossBarColor = PIXI.utils.rgb2hex([0, 1, 0]);
        const injuryColor = 0x8b0000;

        // Bar size logic stolen from core
        let h = Math.max(canvas.dimensions.size / 12, 8);
        const bs = Math.clamp(h / 8, 1, 2);
        if (this.document.height >= 2) h *= 1.6; // Enlarge the bar for large tokens

        const { is, turns, bars } = actor.system.boss ?? {};
        const bossBars = is ? Math.max(turns - 1, bars) : 0;
        const brokenBars = is ? Math.clamp(bossBars - bars, 0, bossBars) : 0;

        const numBars = (temp?.value > 0 ? 2 : 1) + bossBars + 1;
        const barHeight = h / numBars;
        const offset = 0;

        const smallBarWidth = this.w * 0.9;
        const smallWidthOffset = (this.w - smallBarWidth) / 2;

        bar.clear();

        // Draw background
        // bar.lineStyle(0).beginFill(black, 0.5).drawRoundedRect(0, 0, this.w, h, 3);

        // Set border style for temp hp and health bar
        bar.lineStyle(bs / 2, black, 1.0);

        // Draw temp hp
        if (temp?.value > 0) {
            const tempColor = 0x66ccff;
            const tempPercent = Math.clamp(temp.value, 0, (temp.max < temp.value ? temp.value : temp.max)) / (temp.max < temp.value ? temp.value : temp.max);
            const tempWidth = tempPercent * smallBarWidth - 2 * (bs - 1);
            bar.lineStyle(0).beginFill(black, 0.5).drawRoundedRect(smallWidthOffset, 0, smallBarWidth, barHeight, 3);
            bar.beginFill(tempColor, 1.0).drawRoundedRect(smallWidthOffset, 0, tempWidth, barHeight, 2);
            bar.beginFill(black, 0).lineStyle(bs, black, 1.0).drawRoundedRect(smallWidthOffset, 0, smallBarWidth, barHeight, 3);
        }

        // Draw boss bars
        if (bossBars > 0) {
            // const baseBossBarY = (temp?.value > 0 ? 1 : 0) * barHeight + (offset * (temp?.value > 0 ? 1 : 0));
            for (let i = 0; i < bossBars; i++) {
                const bossBarY = ((i + (temp?.value > 0 ? 1 : 0)) * barHeight) + (offset * (temp?.value > 0 ? 1 : 0));

                bar.lineStyle(0).beginFill(black, 0.5).drawRoundedRect(smallWidthOffset, bossBarY, smallBarWidth, barHeight, 3);
                if (i < brokenBars) {
                    bar.beginFill(bossBarColor, 1).drawRoundedRect(smallWidthOffset, bossBarY, 0, barHeight, 2);
                } else {
                    bar.beginFill(bossBarColor, 1).drawRoundedRect(smallWidthOffset, bossBarY, smallBarWidth, barHeight, 2);
                }
                bar.beginFill(black, 0).lineStyle(bs, black, 1.0).drawRoundedRect(smallWidthOffset, bossBarY, smallBarWidth, barHeight, 3);
            }
        }

        // Detirmine the width of the health bar due to injuries
        const injuryPercent = Math.clamp(injuries, 0, 10) / 10;
        const injuryWidth = injuryPercent * this.w;
        const healthWidth = (this.w - injuryWidth) * healthPercent;

        // Draw the health bar
        const healthBarY = ((numBars - 2) * barHeight) + (offset * (numBars - 2));
        bar.lineStyle(0).beginFill(black, 0.5).drawRoundedRect(0, healthBarY, this.w, barHeight * 2, 3);
        bar.beginFill(color, 1.0).drawRoundedRect(0, healthBarY, healthWidth, barHeight * 2, 2);
        if (injuryPercent > 0) {
            bar.beginFill(injuryColor, 1.0).drawRoundedRect(this.w - (injuryWidth) + (injuryPercent < 1 ? 1 : 0), healthBarY, (injuryWidth) - (injuryPercent < 1 ? 1 : 0), barHeight * 2, 2);
            if (injuryPercent < 1) bar.beginFill(black, 1.0).lineStyle(bs, black, 1.0).drawRect(this.w - (injuryWidth), healthBarY + 1, 1, barHeight * 2 - 2);
        }
        bar.beginFill(black, 0).lineStyle(bs, black, 1.0).drawRoundedRect(0, healthBarY, this.w, barHeight * 2, 3);

        // Set position
        bar.position.set(0, number === 0 ? this.h - h : 0);
    }

    /** @override */
    async _drawEffects() {
        // await super.drawEffects();
        const wasVisible = this.effects.visible;
        this.effects.visible = false;
        this.effects.removeChildren().forEach(c => c.destroy());
        this.effects.bg = this.effects.addChild(new PIXI.Graphics());
        this.effects.bg.visible = false;
        this.effects.overlay = null;

        // Categorize new effects
        const tokenEffects = this.document.effects;
        const actorEffects = this.actor?.conditions.active.filter(c => c.isInHUD) ?? [];
        let overlay = {
            src: this.document.overlayEffect,
            tint: null
        };

        // Draw status effects
        if (tokenEffects.length || actorEffects.length) {
            const promises = [];

            // Draw actor effects first
            for (let f of actorEffects) {
                f.icon ??= f.img;
                if (!f.icon) continue;
                const tint = Color.from(f.tint ?? null);
                if (f.getFlag("core", "overlay")) {
                    if (overlay) promises.push(this._drawEffect(overlay.src, overlay.tint));
                    overlay = { src: f.icon, tint };
                    continue;
                }
                promises.push(this._drawEffect(f.icon, tint));
            }

            // Next draw token effects
            for (let f of tokenEffects) promises.push(this._drawEffect(f, null));
            await Promise.all(promises);
        }

        // Draw overlay effect
        this.effects.overlay = await this._drawOverlay(overlay.src, overlay.tint);
        this.effects.bg.visible = true;
        this.effects.visible = wasVisible;
        this._refreshEffects();
    }

    /** @override */
    async _refreshEffects() {
        super._refreshEffects();

        const countEffects = (token) => {
            if (!token) {
                return 0;
            }
            return (this.actor?.conditions.active.filter(c => c.isInHUD) ?? []).length;
        };

        const updateIconSize = (effectIcon, size) => {
            effectIcon.width = size;
            effectIcon.height = size;
        };

        function polar_to_cartesian(r, theta) {
            return {
                x: r.x * Math.cos(theta),
                y: r.y * Math.sin(theta),
            };
        }

        const updateIconPosition = (effectIcon, i, effectIcons, token) => {
            const actorSize = Math.min(token.document.width, token.document.height)
            let max = 20;
            if (actorSize == 0.25) max = 10;
            if (actorSize == 0.5) max = 14;
            if (actorSize == 1) max = 16;
            const ratio = i / max;
            // const angularOffset = i < max ? 0 : ratio / 2;
            const gridSize = token?.scene?.grid?.size ?? 100;
            const tokenTileFactorX = token?.document?.width ?? 1;
            const tokenTileFactorY = token?.document?.height ?? 1;
            const sizeOffset = sizeToOffset(actorSize);
            const offsetX = sizeOffset * tokenTileFactorX * (gridSize * 1.1);
            const offsetY = sizeOffset * tokenTileFactorY * (gridSize * 1.1);
            const initialRotation = (0.5 + (1 / max) * Math.PI) * Math.PI;
            const { x, y } = polar_to_cartesian({ x: offsetX, y: offsetY }, (ratio + 0) * 2 * Math.PI + initialRotation);
            //const { x, y } = polar_to_cartesian_square(offset, (ratio + 0) * 2 * Math.PI + initialRotation, gridSize * tokenTileFactor);
            // debugger;
            effectIcon.position.x = x / 2 + (gridSize * tokenTileFactorX) / 2;
            effectIcon.position.y = (-1 * y) / 2 + (gridSize * tokenTileFactorY) / 2;
        };

        // Nudge icons to be on the token ring or slightly outside
        function sizeToOffset(size) {
            if (size <= 0.5) return 1.0;
            if (size > 0.5 && size <= 1) return 1.3;
            if (size > 1) return 0.925;
            return 1;
        }

        function sizeToIconScale(size) {
            if (size <= 0.5) return 1;
            if (size > 0.5 && size <= 1) return 1.4;
            if (size > 1 && size <= 2) return 1.8;
            if (size > 2 && size <= 3) return 2.2;
            if (size > 3) return 2.6;
            return 1;
        }

        const drawBG = (effectIcon, background, gridScale) => {
            const r = effectIcon.width / 2;
            background.lineStyle((1 * gridScale) / 2, 0x343434, 1, 0);
            background.drawCircle(effectIcon.position.x, effectIcon.position.y, r + 1.1 * gridScale);
            background.beginFill(0x010101, 0.50);
            background.drawCircle(effectIcon.position.x, effectIcon.position.y, r + 1.1 * gridScale);
            background.endFill();
        };

        const token = this;
        const numEffects = countEffects(token);
        // debugger;
        if (numEffects > 0 && token.effects.children.length > 0) {
            const background = token.effects.children[0];
            if (!(background instanceof PIXI.Graphics)) {
                return;
            }
            background.clear();

            // Exclude the background and overlay
            const effectIcons = token.effects.children.slice(1, 1 + numEffects);
            const tokenSize = Math.max(token.document.width, token.document.height)

            const gridSize = token?.scene?.grid?.size ?? 100;
            // Reposition and scale them
            effectIcons.forEach((effectIcon, i, effectIcons) => {
                if (!(effectIcon instanceof PIXI.Sprite)) {
                    return;
                }
                // debugger;

                effectIcon.anchor.set(0.5);

                const iconScale = sizeToIconScale(tokenSize);
                const gridScale = gridSize / 100;
                const scaledSize = 12 * iconScale * gridScale;
                updateIconSize(effectIcon, scaledSize);
                updateIconPosition(effectIcon, i, effectIcons, token);
                drawBG(effectIcon, background, gridScale);
            });
        }
    }

    /** @override */
    _refreshNameplate() {
        if (!this.actor?.identified) {
            if (this.nameplate.text !== game.i18n.localize("PTU.Unidentified")) this.nameplate.text = game.i18n.localize("PTU.Unidentified");
            return;
        }
        super._refreshNameplate();
    }

    async showFloatyText(params) {
        if (!this.isVisible) return;

        /**
         * If the floaty text is generated by an effect being created/deleted
         * We do not display it if the effect is unidentified
         */
        if (!game.user.isGM && typeof params !== "number") {
            const [_, document] = Object.entries(params)[0];
            if (document instanceof BaseEffectPTU && document.isIdentified) return;
        }

        const scrollingTextArgs = (() => {
            if (typeof params === "number") {
                const quantity = params;
                const maxHP = this.actor?.system?.health?.max;
                if (!quantity) return null;

                const percent = Math.clamp(Math.abs(quantity) / maxHP, 0, 1);
                const textColors = {
                    damage: 16711680, // reddish
                    healing: 65280, // greenish
                };
                return [
                    this.center,
                    params.signedString(),
                    {
                        anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
                        jitter: 0.25,
                        fill: textColors[quantity < 0 ? "damage" : "healing"],
                        fontSize: 16 + 32 * percent, // Range between [16, 48]
                        stroke: 0x000000,
                        strokeThickness: 4,
                    },
                ];
            } else {
                const [change, details] = Object.entries(params)[0];
                const isAdded = change === "create";
                const sign = isAdded ? "+ " : "- ";
                const appendedNumber = !(/ \d+$/.test(details.name)) && details.value ? ` ${details.value}` : "";
                const content = `${sign}${details.name}${appendedNumber}`;
                const anchorDirection = isAdded ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM;
                const textStyle = this._getTextStyle();

                return [
                    this.center,
                    content,
                    {
                        fill: textStyle.fill,
                        fontSize: textStyle.fontSize,
                        stroke: textStyle.stroke,
                        strokeThickness: textStyle.strokeThickness,
                        anchor: anchorDirection,
                        direction: anchorDirection,
                        jitter: 0.25,
                    },
                ];
            }
        })();
        if (!scrollingTextArgs) return;

        await this._animation;
        await canvas.interface?.createScrollingText(...scrollingTextArgs);
    }

    /**
     * Measure the distance between this token and another object, in grid distance. We measure between the
     * centre of squares, and if either covers more than one square, we want the minimum distance between
     * any two of the squares.
     */
    distanceTo(target, options = {}) {
        if (!canvas.dimensions) return NaN;

        if (this === target) return 0;

        if (canvas.grid.type !== CONST.GRID_TYPES.SQUARE) {
            return canvas.grid.measureDistance(this.position, target.position);
        }

        const selfElevation = this.document.elevation;
        const targetElevation = target.document.elevation;
        if (selfElevation === targetElevation || !this.actor || !target.actor) {
            return measureDistanceCuboid(this.bounds, target.bounds, {}, options);
        }

        return measureDistanceCuboid(this.bounds, target.bounds, {
            token: this,
            target,
        }, options);
    }

    isFlanked() {
        if (!game.settings.get("ptu", "automation.flankingDetection")) return false;
        const flankingTokens = canvas.tokens.placeables.filter(t => t !== this && t.canFlank(this));
        if (flankingTokens.length <= 1) return false;

        function roundToNearest(value, numbers) {
            const differences = numbers.map(num => Math.abs(num - value));
            const minDifference = Math.min(...differences);
            const index = differences.indexOf(minDifference);
            return numbers[index];
        }

        const flankerRequirement = (() => {
            switch (roundToNearest(this.document.width * this.document.height, [1, 4, 9, 16, 25])) {
                case 1:
                    return 2;
                case 4:
                    return 3;
                case 9:
                    return 4;
                case 16:
                    return 5;
                case 25:
                    return 6;
                default:
                    return 2;
            }
        })()

        const flankersFlanking = flankingTokens.reduce((acc, flanker) => {
            const otherFlankers = flankingTokens.filter(t => t !== flanker);
            const sizeFlankCount = (() => {
                switch (roundToNearest(flanker.document.width * flanker.document.height, [1, 4, 9, 16, 25])) {
                    case 1:
                        return 1;
                    case 4:
                        return 2;
                    case 9:
                        return 3;
                    case 16:
                        return 4;
                    case 25:
                        return 5;
                    default:
                        return 1;
                }
            })();

            let flankedByCount = sizeFlankCount // Flanked by self
            for (const otherFlanker of otherFlankers) {
                if (flanker.distanceTo(otherFlanker) < 2) continue;
                flankedByCount++;
            }
            return {
                ...acc,
                [flanker.id]: flankedByCount > sizeFlankCount ? flankedByCount : 0
            };
        }, {});

        const flankedByCount = Object.values(flankersFlanking).reduce((acc, count) => Math.max(acc, count), 0);

        return flankedByCount >= flankerRequirement;
    }

    canFlank(flankee) {
        if (!this.actor || !flankee.actor) return false;
        if (this === flankee || !game.settings.get("ptu", "automation.flankingDetection")) return false;
        if (this.actor.conditions.bySlug("fainted").length > 0) return false;

        if (!this.actor.isEnemyOf(flankee.actor)) return false;

        return this.distanceTo(flankee) <= 1;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    _onControl(options = {}) {
        if (game.ready) game.ptu.tokenPanel.refresh(true);
        super._onControl(options);
    }

    /** @override */
    _onRelease(options) {
        game.ptu.tokenPanel.refresh(true);
        super._onRelease(options);
    }
}

export { PTUToken } 