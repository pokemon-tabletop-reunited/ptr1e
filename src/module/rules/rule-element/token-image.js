import { RuleElementPTU, isBracketedValue } from "./base.js";

export class TokenImageRuleElement extends RuleElementPTU {
    constructor(data, item, options = {}) {
        const { value, scale, tint, alpha, size, sizeClass } = data;
        super(data, item, options);

        if (typeof value === "string" || isBracketedValue(value)) {
            this.value = value;
        } else {
            this.value = null;
        }

        if (typeof scale === "number" && scale > 0) {
            this.scale = scale;
        }

        if (typeof tint === "string") {
            this.tint = Color.from(tint).toString();
        }

        if (typeof alpha === "number") {
            this.alpha = alpha;
        }

        if (typeof size === "number") {
            this.size = size;
        }
        
        if (typeof sizeClass === "string") {
            this.size ??= (() => {;
                switch (sizeClass) {
                    case "Small": return 1;
                    case "Medium": return 1;
                    case "Large": return 2;
                    case "Huge": return 3;
                    case "Gigantic": return 4;
                    default: return null;
                }
            })();
            this.scale ??= sizeClass === "Small" ? 0.6 : 1;
        }
    }

    /** @override */
    afterPrepareData() {
        let src = this.value;
        if (!this.#srcIsValid(src)) src = this.resolveValue(this.value, 0, {evaluate: false});

        if (!this.test()) return;

        const texture = {};
        if (this.#srcIsValid(src)) {
            texture.src = src;
        }
        if (this.scale) {
            texture.scaleX = this.scale;
            texture.scaleY = this.scale;
        }

        if (this.tint) {
            texture.tint = this.tint;
        }

        if (typeof this.alpha === "number") {
            this.actor.synthetics.tokenOverrides.alpha = this.alpha;
        }

        if (typeof this.size === "number") {
            this.actor.synthetics.tokenOverrides.width = this.size;
            this.actor.synthetics.tokenOverrides.height = this.size;
        }

        this.actor.synthetics.tokenOverrides.texture = texture;
    }

    #srcIsValid(src) {
        if (typeof src !== "string") return false;
        if (src.includes("{")) return false;
        const extension = /(?<=\.)([a-z0-9]{3,4})(\?[a-zA-Z0-9]+)?$/i.exec(src)?.at(1);
        return !!extension && (extension in CONST.IMAGE_FILE_EXTENSIONS || extension in CONST.VIDEO_FILE_EXTENSIONS);
    }
}