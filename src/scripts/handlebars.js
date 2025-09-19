import { pokeballStyles, pokeballShapes } from "./config/data/pokeball-themes.js";
import { capitalize, formatSlug } from "../util/misc.js";

export function registerHandlebarsHelpers() {
    _registerBasicHelpers();
    _registerPTUHelpers();
}

// TODO: Go over these and optimize / replace / remove as necessary
function _registerPTUHelpers() {

    Handlebars.registerHelper("getGameSetting", function (key) { return game.settings.get("ptu", key) });
    Handlebars.registerHelper("getProperty", foundry.utils.getProperty); // native foundry function

    Handlebars.registerHelper("json", function (context) { return JSON.stringify(context); });

    Handlebars.registerHelper("shortFrequency", function (frequency) {
        switch (frequency.toLowerCase()) {
            case "at-will":
                return "At-Will";
            case "eot":
                return "EOT";
            case "scene":
                return "1x Scene";
            case "scene x2":
                return "2x S";
            case "scene x3":
                return "3x S";
            case "daily":
                return "1x D";
            case "daily x2":
                return "2x D";
            case "daily x3":
                return "3x D";
            default:
                return frequency;
        }
    })

    Handlebars.registerHelper("calcHeight", function (percent) {
        return Math.clamp(Math.round((100 - percent) / 100 * 48), 0, 48);
    });

    // //pokeball themed background for pokemon
    // Handlebars.registerHelper('pokeballStyles', function (pokeball) {

    //     // Get the styles for the provided Pokeball type
    //     const styles = game.settings.get("ptu", "pokeballBackgroundThemes") ? (CONFIG.PTU.data.sheetThemes.styles[pokeball] || CONFIG.PTU.data.sheetThemes.defaultStyle) : CONFIG.PTU.data.sheetThemes.defaultStyle;

    //     const highlightShape = styles.highlightShape ? CONFIG.PTU.data.sheetThemes.shapes[styles.highlightShape] ?? "" : "";

    //     // Return the constructed styles
    //     return new Handlebars.SafeString(`
    //         <div name="top" style="width: 100%;
    //             height: 100%;
    //             display: block;
    //             position: absolute;
    //             z-index: 1;
    //             background: ${styles.backgroundColor};
    //             clip-path: polygon(0 0, 52% 0, 22% 100%, 0% 100%);">
    //         </div>
    //         <div name ="bottom" style="
    //             width: 100%;
    //             height: 100%;
    //             display: block;
    //             position: absolute;
    //             z-index: 0;
    //             background: linear-gradient(45deg, ${styles.gradientColors});
    //             clip-path: polygon(100% 0, 45% 0, 15% 100%, 100% 100%);">
    //         </div>
    //         ${highlightShape}
    //         <div name="toplight" style="width: 100%;
    //             height: 100%;
    //             display: block;
    //             position: absolute;
    //             z-index: 1;
    //             background: ${styles.topLightColor};
    //             clip-path: polygon(0 0, 44% 0, 14% 100%, 0% 100%);">
    //             </div>
    //         <div name="band" style="width: 100%;
    //             height: 100%;
    //             display: block;
    //             position: absolute;
    //             z-index: 0;
    //             background: ${styles.bandColor};
    //             clip-path: polygon(0 0, 52% 0, 22% 100%, 0% 100%);
    //             transform: translateY(0%) translateX(2%);">
    //         </div>
    //     `);
    // });

    // Handlebars.registerHelper("pokeBallHeaderStyle", function (pokeball) {
    //     const styles = game.settings.get("ptu", "pokeballBackgroundThemes") ? (CONFIG.PTU.data.sheetThemes.styles[pokeball] || CONFIG.PTU.data.sheetThemes.defaultStyle) : CONFIG.PTU.data.sheetThemes.defaultStyle;
    //     return new Handlebars.SafeString(`${styles.backgroundColor}`);
    // });

    // Handlebars.registerHelper("pokeBallHighlightStyle", function (pokeball) {
    //     const styles = game.settings.get("ptu", "pokeballBackgroundThemes") ? (CONFIG.PTU.data.sheetThemes.styles[pokeball] || CONFIG.PTU.data.sheetThemes.defaultStyle) : CONFIG.PTU.data.sheetThemes.defaultStyle;
    //     if(styles.highlight) return new Handlebars.SafeString(`${styles.backgroundColor}`);
    //     return new Handlebars.SafeString(`black`);
    // });

    //     Handlebars.registerHelper("itemDescription", function (name) {
    //         if (!name) return "";
    //         if (name || 0 !== name.length) {
    //             let item = game.ptu.data.items.find(i => i.name.toLowerCase().includes(name.toLowerCase()));
    //             if (item) return item.system.effect;
    //         }
    //         return "";
    //     });
    Handlebars.registerHelper("getDb", function (db) {
        return CONFIG.PTU.data.dbData[db];
    });

    Handlebars.registerHelper("calcDb", function (move) {
        return (move.damageBase.toString().match(/^[0-9]+$/) != null) ? move.stab ? parseInt(move.damageBase) + 2 : move.damageBase : move.damageBase;
    });

    Handlebars.registerHelper("dbToDice", function (db, actor) {
    });

    Handlebars.registerHelper("moveDbToDice", (item, actor) => {
        const dbNumber = Number(item.damageBase.postStab ?? item);
        if (isNaN(dbNumber)) return "Not a valid DB";

        const realDb = Math.clamp(dbNumber, 0, 28);
        const dbString = CONFIG.PTU.data.dbData[realDb];

        if (!actor) return dbString;
        const bonus = item.system.category === "Physical" ? actor.system.stats.atk.total + (actor.system.modifiers.damageBonus?.physical?.total ?? 0) : actor.system.stats.spatk.total + (actor.system.modifiers.damageBonus?.special?.total ?? 0);

        return dbString + " + " + bonus;
    });

    //     Handlebars.registerHelper("calcAc", function (move) {
    //         return -parseInt(move.ac) + parseInt(move.acBonus);
    //     });

    //     Handlebars.registerHelper("calcMoveDb", function (actorData, move, bool = false) {
    //         return _calcMoveDb(PrepareMoveData(actorData, move), bool);
    //     });

    //     Handlebars.registerHelper("calcCritRange", function (actorData) {
    //         return actorData.modifiers.critRange?.total ? actorData.modifiers.critRange?.total : 0;
    //     });

    //     Handlebars.registerHelper("calcCritRangeMove", function (move) {
    //         return move.owner ? move.owner.critRange : 0;
    //     });

    Handlebars.registerHelper("aeTypes", function (id) {
        const types = Object.entries(CONST.ACTIVE_EFFECT_MODES).reduce((obj, e) => {
            obj[e[1]] = game.i18n.localize("EFFECT.MODE_" + e[0]);
            return obj;
        }, {});
        return id ? types[id] : types;
    })

    //     Handlebars.registerHelper("calcFrequencyIconPath", function (frequency, currentUseCount) {
    //         const basePath = "systems/ptu/images/icons/";
    //         const useCount = Number(currentUseCount);
    //         switch (frequency) {
    //             case "At-Will":
    //             case "":
    //                 return basePath + "AtWill" + ".png";
    //             case "EOT":
    //                 return basePath + (useCount == 0 ? "EOT_1" : "EOT_0") + ".png";
    //             case "Scene":
    //                 return basePath + (useCount >= 1 ? "Scene1_0" : "Scene1_1") + ".png";
    //             case "Scene x2":
    //                 return basePath + (useCount >= 2 ? "Scene2_0" : useCount == 1 ? "Scene2_1" : "Scene2_2") + ".png";
    //             case "Scene x3":
    //                 return basePath + (useCount >= 3 ? "Scene3_0" : useCount == 2 ? "Scene3_1" : useCount == 1 ? "Scene3_2" : "Scene3_3") + ".png";
    //             case "Daily":
    //                 return basePath + (useCount >= 1 ? "daily1_0" : "daily1_1") + ".png";
    //             case "Daily x2":
    //                 return basePath + (useCount >= 2 ? "daily2_0" : useCount == 1 ? "daily2_1" : "daily2_2") + ".png";
    //             case "Daily x3":
    //                 return basePath + (useCount >= 3 ? "daily3_0" : useCount == 2 ? "daily3_1" : useCount == 1 ? "daily3_2" : "daily3_3") + ".png";
    //         }
    //     })

    Handlebars.registerHelper("natureCheck", function (nature, stat) {
        let statUp = CONFIG.PTU.data.natureData[nature][0] == keyToNatureStat(stat);
        let statDown = CONFIG.PTU.data.natureData[nature][1] == keyToNatureStat(stat)

        return statUp && !statDown ? "nature-up" : statDown && !statUp ? "nature-down" : "";
    });

    function keyToNatureStat(key) {
        switch (key) {
            case "hp": return "HP";
            case "atk": return "Attack";
            case "def": return "Defense";
            case "spatk": return "Special Attack";
            case "spdef": return "Special Defense";
            case "spd": return "Speed";
        }
    }

    //     Handlebars.registerHelper("hideAcOrDb", function (text) {
    //         return text == "" || text == "--";
    //     });

    Handlebars.registerHelper("loadTypeImages", function (types) {
        if (!types) return;
        if (!(types instanceof Array)) types = [types];

        let html = "";
        for (let type of types) {
            if (type == "null") type = "Untyped";
            if (CONFIG.PTU.data.typeEffectiveness[type]) {
                html += `<img class="type-image" src="${CONFIG.PTU.data.typeEffectiveness[type].images.bar}">`;
            }
        }
        return html;
    });

    Handlebars.registerHelper("loadTypeImageBar", function (type) {
        return CONFIG.PTU.data.typeEffectiveness[type]?.images.bar ?? CONFIG.PTU.data.typeEffectiveness["Untyped"].images.bar;
    });
    Handlebars.registerHelper("loadTypeImageIcon", function (type) {
        return CONFIG.PTU.data.typeEffectiveness[type]?.images.icon ?? CONFIG.PTU.data.typeEffectiveness["Untyped"].images.icon;
    });

    Handlebars.registerHelper("typeSelect", function (selectedType) {
        return `<option value="Untyped"></option>` + Object.keys(CONFIG.PTU.data.typeEffectiveness).filter(type => type != "Untyped").reduce((html, type) =>
            html += `<option ${type == selectedType ? "selected" : ""} style="color: #191813;" value="${type}">${type}</option>`
            , "");
    });

    //     Handlebars.registerHelper("toReadableEffectMode", function (effectId) {
    //         return Object.entries(CONST.ACTIVE_EFFECT_MODES).reduce((obj, e) => {
    //             obj[e[1]] = game.i18n.localize("EFFECT.MODE_" + e[0]);
    //             return obj;
    //         }, {})[effectId]
    //     })

    //     Handlebars.registerHelper('getEffectivenessColor', function (effectiveness) {
    //         const value = Number(effectiveness);
    //         if (isNaN(value)) return "regular";

    //         if (value === -1) return "none";
    //         if (value < 1) {
    //             if (value == 0) {
    //                 return "immune";
    //             }
    //             if (value <= 0.25) {
    //                 return "doubly_resisted";
    //             }
    //             return "resisted";
    //         }
    //         if (value > 1) {
    //             if (value >= 2) {
    //                 return "doubly_effective";
    //             }
    //             return "effective";
    //         }
    //         return "regular";
    //     })

    //     Handlebars.registerHelper("getStat", function (species, statKey) {
    //         const speciesStats = game.ptu.utils.species.get(species);
    //         if (!speciesStats) return 0;

    //         const renamingDict = {
    //             "hp": "HP",
    //             "atk": "Attack",
    //             "def": "Defense",
    //             "spatk": "Special Attack",
    //             "spdef": "Special Defense",
    //             "spd": "Speed"
    //         };

    //         let key = renamingDict[statKey];
    //         if (!key) key = statKey;

    //         return speciesStats["Base Stats"][key] ?? 0;
    //     });

    //     Handlebars.registerHelper("tmName", function (tmNum) { return game.ptu.data.TMsData.get(tmNum) });

    Handlebars.registerHelper("helpText", function (item) {
        if (!item) return;

        if (item.toString().match(/^[0-9]+$/) != null) {
            return CONFIG.PTU.data.helpText["Range"](item);
        }

        if (item.toString().match(/^[0-9]+\sTarget$/) != null) {
            return CONFIG.PTU.data.helpText["Target"](item.toString().split(" ")[0]);
        }

        if (item.toString().match(/^[0-9]+\sDB$/) != null) {
            return CONFIG.PTU.data.helpText["DamageBase"](item.toString().split(" ")[0]);
        }

        return CONFIG.PTU.data.helpText[item];
    });

    function _calcMoveDb(move, owner) {
        if (!move || move.type != "move") return;
        if (move.system.category === "Status") return;

        const bonus = parseInt((owner ? (
            move.system.category === "Physical" ?
                owner.system.stats.atk.total + (owner.system.modifiers.damageBonus?.physical?.total ?? 0) :
                owner.system.stats.spatk.total + (owner.system.modifiers.damageBonus?.special?.total ?? 0)
        ) : 0) + move.system.damageBonus ?? 0);

        if (move.system.damageBase.toString().match(/^[0-9]+$/) != null) {
            const stab = owner.system.typing && owner.system.typing.includes(move.system.type);
            const db = CONFIG.PTU.data.dbData[stab ? parseInt(move.system.damageBase) + 2 : move.system.damageBase];
            if (db) return db + " + " + bonus;
            return -1;
        }
        if (move.system.damageBase.toString().match(/^[0-9]+\sDamage$/) != null) return move.system.damageBase;
        return -1;
    }
}

function _registerBasicHelpers() {
    Handlebars.registerHelper("concat", function () {
        var outStr = '';
        for (var arg in arguments) {
            if (typeof arguments[arg] != 'object') {
                outStr += arguments[arg];
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('switch', function (value, options) {
        this.switch_value = value;
        return options.fn(this);
    });

    Handlebars.registerHelper('case', function (value, options) {
        if (value == this.switch_value) {
            return options.fn(this);
        }
    });

    Handlebars.registerHelper("toLowerCase", function (str) {
        return str.toLowerCase ? str.toLowerCase() : str;
    });

    Handlebars.registerHelper("capitalizeFirst", (e) => { return "string" != typeof e ? e : e.charAt(0).toUpperCase() + e.slice(1) });

    Handlebars.registerHelper("capitalize", capitalize);

    Handlebars.registerHelper("formatLocalize", (key, value) => ({
        "hash": {
            [key]: value
        }
    }));

    Handlebars.registerHelper("formatSlug", formatSlug);

    Handlebars.registerHelper("isdefined", function (value) {
        return value !== undefined;
    });

    Handlebars.registerHelper("is", function (a, b) { return a == b });
    Handlebars.registerHelper("bigger", function (a, b) { return a > b });
    Handlebars.registerHelper("biggerOrEqual", function (a, b) { return a >= b });
    Handlebars.registerHelper("and", function (a, b) { return a && b });
    Handlebars.registerHelper("or", function (a, b) { return a || b });
    Handlebars.registerHelper("notEqual", function (a, b = false) { return a != b });
    Handlebars.registerHelper("divide", (value1, value2) => Number(value1) / Number(value2));
    Handlebars.registerHelper("multiply", (value1, value2) => Number(value1) * Number(value2));
    Handlebars.registerHelper("floor", (value) => Math.floor(Number(value)));

    Handlebars.registerHelper("minMaxDiceCheck", function (roll, faces) {
        return roll == 1 ? "min" : roll == faces ? "max" : "";
    });

    Handlebars.registerHelper("isGm", function () {
        return game.user.isGM;
    })

    Handlebars.registerHelper('contains', function (needle, haystack) {
        needle = Handlebars.escapeExpression(needle);
        haystack = Handlebars.escapeExpression(haystack);
        return (haystack.indexOf(needle) > -1) ? true : false;
    });

    Handlebars.registerHelper('ifContains', function (needle, haystack, options) {
        needle = Handlebars.escapeExpression(needle);
        haystack = Handlebars.escapeExpression(haystack);
        return (haystack.indexOf(needle) > -1) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("inc", function (num) { return Number(num) + 1 })

    Handlebars.registerHelper("newline", function (a) { return a.replace("\\n", "\n") });

    Handlebars.registerHelper("lpad", function (str, len, char) {
        str = str.toString();
        while (str.length < len) str = char + str;
        return str;
    });

    Handlebars.registerHelper('padDecimal', function (value, decimals) {
        const stringValue = String(value);
        const decimalIndex = stringValue.indexOf('.');
        if (decimalIndex === -1) {
            // No decimal point found, add the specified number of decimal places
            return `${stringValue}.${'0'.repeat(decimals)}`;
        } else {
            // Decimal point found, pad the decimal places up to the specified number
            const numDecimals = stringValue.length - decimalIndex - 1;
            if (numDecimals < decimals) {
                return `${stringValue}${'0'.repeat(decimals - numDecimals)}`;
            } else {
                return stringValue;
            }
        }
    });

    Handlebars.registerHelper("diceResult", function (roll, term) {
        const result = roll.terms.find(t => t.faces == term);
        if (result) return result.total ?? result.results[0].result;
    });

    Handlebars.registerHelper("split", function (str, separator) {
        return str.split(separator).map(s => s.trim());
    });

    Handlebars.registerHelper("isNumber", function (value) {
        return isNaN(Number(value)) == false;
    });

    Handlebars.registerHelper("ld", function (key, value) {
        return { hash: { [key]: value } };
    })
}