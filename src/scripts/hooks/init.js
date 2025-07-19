import { PTUCONFIG } from "../config/index.js"
import { GamePTU } from "../game-ptu.js"
import { registerSettings } from "../../module/system/index.js"
import { registerHandlebarsHelpers } from "../handlebars.js"
import { registerSheets } from "../sheets.js"
import { registerTemplates } from "../templates.js"
import { insurgenceData, sageData, uraniumData } from "../config/data/fangame-species-data.js"
import { measureDistances } from "../../module/canvas/helpers.js"


export const Init = {
    listen() {
        Hooks.on("init", () => {
            // Add your init hooks here
            console.log("PTU System | Initializing Pokemon Tabletop Reunited System")

            // Add actor() to window
            window.actor = function () {
                return canvas.tokens.controlled[0].actor;
            }

            // Add PTUCONFIG to CONFIG
            CONFIG.PTU = PTUCONFIG

            CONFIG.User.documentClass = PTUCONFIG.User.documentClass;

            // Set custom combat settings
            CONFIG.Combat.initiative = PTUCONFIG.combat.initiative;
            CONFIG.Combat.documentClass = PTUCONFIG.combat.documentClass;
            CONFIG.Combat.defeatedStatusId = PTUCONFIG.combat.defeatedStatusId;
            CONFIG.Combatant.documentClass = PTUCONFIG.combatant.documentClass;
            CONFIG.ui.combat = PTUCONFIG.combat.uiClass;

            // Define custom Entity classes
            CONFIG.Actor.documentClass = PTUCONFIG.Actor.proxy;
            CONFIG.Item.documentClass = PTUCONFIG.Item.proxy;

            // Disable Active Effects
            CONFIG.ActiveEffect.documentClass = PTUCONFIG.ActiveEffect.documentClass

            // Define Status Effects
            CONFIG.statusEffects = PTUCONFIG.statusEffects;

            // Define Custom Token Object Class
            CONFIG.Token.objectClass = PTUCONFIG.Token.objectClass;
            CONFIG.Token.documentClass = PTUCONFIG.Token.documentClass;

            // Define Custom Roll classes
            CONFIG.Dice.rolls ??= []
            CONFIG.Dice.rolls.push(...PTUCONFIG.Dice.rolls);

            // Define Custom Chat 
            CONFIG.ui.chat = PTUCONFIG.ui.chatlog.documentClass;
            CONFIG.ChatMessage.documentClass = PTUCONFIG.ChatMessage.documentClass;

            // Define other custom UI classes
            CONFIG.ui.hotbar = PTUCONFIG.ui.hotbar.documentClass;

            // Insert templates into DOM tree so Applications can render into
            if (document.querySelector("#ui-top") !== null) {
                // Template element for effects-panel
                const uiTop = document.querySelector("#ui-top");
                const template = document.createElement("template");
                template.setAttribute("id", "ptu-token-panel");
                uiTop?.insertAdjacentElement("afterend", template);
            }

            // Register stuff with the Foundry client
            registerSheets();
            // registerFonts();
            registerHandlebarsHelpers();
            // registerKeybindings();
            registerSettings();
            registerTemplates();

            if(game.settings.get("ptu", "devMode")) CONFIG.ui.items.prototype._onDragStart = _onDragStart;

            // Register Constants
            CONST = {
                ...CONST,
                STATS_FACTOR: 0.5,
                STATS_SIGMA: 3.5,
            }
            Object.seal(CONST);

            // Create and populate initial game.ptu interface
            GamePTU.onInit();
        })
        Hooks.on("canvasInit", function () {
            // Extend Diagonal Measurement
            foundry.grid.SquareGrid.prototype.measureDistances = measureDistances;
        });
    }
}

/** @override */
function _onDragStart(event) {
    if ( ui.context ) ui.context.close({animate: false});
    const li = event.currentTarget.closest(".directory-item");
    const item = game.items.get(li.dataset.entryId);
    if ( !item ) return;
    const dragData = {
        type: item.documentName,
        data: item.toObject()
    }
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }