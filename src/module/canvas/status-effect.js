import { ActiveEffectPTU } from "../active-effect.js";
import { PTUCondition } from "../item/index.js";

export class StatusEffects {
    static async onRenderTokenHUD(html, tokenData) {
        const token = canvas.tokens.get(tokenData._id);
        if (!token) return;

        let iconGrid = html.querySelector(".status-effects");
        
        if (!iconGrid) {
            console.warn("PTU | Could not find status effect icon grid in TokenHUD - skipping status effect enhancement");
            return;
        }

        const affectingConditions = token.actor?.conditions.filter(c => c.isInHUD) ?? [];

        const titleBar = document.createElement("div");
        titleBar.className = "title-bar";
        iconGrid.append(titleBar);

        const statusIcons = iconGrid.querySelectorAll(".effect-control");

        for (const icon of statusIcons) {
            // Replace the img element with a picture element, which can display ::after content
            const picture = document.createElement("picture");
            picture.classList.add("effect-control");
            picture.dataset.statusId = icon.dataset.statusId;
            picture.title = icon.dataset.tooltip || icon.title;
            const iconSrc = icon.getAttribute("src")
            picture.setAttribute("src", iconSrc);
            const newIcon = document.createElement("img");
            newIcon.src = iconSrc;
            picture.append(newIcon);
            icon.replaceWith(picture);

            const slug = picture.dataset.statusId ?? "";
            const affecting = affectingConditions.filter((c) => c.system.origin === slug || c.slug === slug);
            if (affecting.length > 0 || iconSrc === token.document.overlayEffect) {
                picture.classList.add("active");
            }

            if (affecting.length > 0) {
                // Show a badge icon if the condition has a value or is locked
                const isOverridden = affecting.every((c) => c.isOverriden);
                const isLocked = affecting.every((c) => c.isLocked);
                const hasValue = affecting.some((c) => c.value);

                if (isOverridden) {
                    picture.classList.add("overridden");
                    const badge = fontAwesomeIcon("angle-double-down");
                    badge.classList.add("badge");
                    picture.append(badge);
                } else
                    if (isLocked) {
                        picture.classList.add("locked");
                        const badge = fontAwesomeIcon("lock");
                        badge.classList.add("badge");
                        picture.append(badge);
                    } else if (hasValue) {
                        picture.classList.add("valued");
                        const badge = document.createElement("i");
                        badge.classList.add("badge");
                        const value = Math.max(...affecting.map((c) => c.value ?? 1));
                        badge.innerText = value.toString();
                        picture.append(badge);
                    }
            }
        }

        this.#activateListeners(iconGrid);
    }

    static #activateListeners(html) {
        // Mouse actions
        for (const control of Array.from(html.querySelectorAll(".effect-control"))) {
            control.addEventListener("click", (event) => {
                this.#setStatusValue(control, event);
            });
            control.addEventListener("contextmenu", (event) => {
                this.#setStatusValue(control, event);
            });
            control.addEventListener("mouseover", () => {
                this.#showStatusLabel(control);
            });
            control.addEventListener("mouseout", () => {
                this.#showStatusLabel(control);
            });
        }
    }

    static #showStatusLabel(control) {
        const titleBar = control.closest(".status-effects, .effects, .status-icons, .token-effects")?.querySelector(".title-bar");
        if (titleBar && control.title) {
            const $titleBar = $(titleBar);
            // if(control.title?.length > 11) $titleBar.css("top", "-65.42px");
            // else $titleBar.css("top", "-40px");
            titleBar.innerText = control.title;
            $titleBar.toggleClass("active");
        }
    }


    static async #setStatusValue(control, event) {
        event.preventDefault();
        event.stopPropagation();

        const slug = control.dataset.statusId;

        for (const token of canvas.tokens.controlled) {
            const { actor } = token;
            if (!(actor && slug)) continue;

            const condition = actor.conditions.bySlug(slug, { active: true, temporary: false }).find(c => c.isInHUD && !c.system.references.parent);

            if (event.type === "click") {
                if (typeof condition?.value === "number") {
                    await token.actor?.createEmbeddedDocuments("Item", [condition.toObject()]);
                }
                else {
                    this.#toggleStatus(token, control, event);
                }
            }
            else if (event.type === "contextmenu") {
                if (condition?.value) {
                    await token.actor?.decreaseCondition?.(slug);
                }
                else {
                    this.#toggleStatus(token, control, event);
                }
            }
        }
        this.refresh();
    }

    static async #toggleStatus(token, control, event) {
        const { actor } = token;
        if (!actor) return;

        const slug = control.dataset.statusId ?? "";

        const imgElement = control.querySelector("img");
        const iconSrc = imgElement.getAttribute("src");

        const affecting = actor?.conditions
            .bySlug(slug, { active: true, temporary: false })
            .find((c) => !c.system.references.parent);
        const statusEffect = CONFIG.statusEffects.find(se => se.id == slug);

        if (event.type === "click" && !affecting) {
            if (statusEffect) {
                const conditions = await PTUCondition.FromEffects([statusEffect]);
                await token.actor?.createEmbeddedDocuments("Item", conditions);
            }
            else if (iconSrc && event.shiftKey) {
                await token.toggleEffect(iconSrc, { overlay: true, active: true });
            }
        }
        else if (event.type === "contextmenu") {
            if (affecting) await token.actor?.deleteEmbeddedDocuments("Item", [affecting.id]);
            else if (token.document.overlayEffect === iconSrc) await token.toggleEffect(iconSrc, { overlay: true, active: false });
            // else await token.toggleEffect(iconSrc, {overlay: true, active: true});
        }
    }

    static refresh() {
        if (canvas.ready && canvas.tokens.hud.rendered) debouncedRender();
    }
}

const debouncedRender = foundry.utils.debounce(() => {
    canvas.tokens.hud.render();
}, 20);

export function fontAwesomeIcon(
    glyph,
    { style = "solid", fixedWidth = false } = {}
) {
    const styleClass = `fa-${style}`;
    const glyphClass = glyph.startsWith("fa-") ? glyph : `fa-${glyph}`;
    const icon = document.createElement("i");
    icon.classList.add(styleClass, glyphClass);
    if (fixedWidth) icon.classList.add("fa-fw");

    return icon;
}