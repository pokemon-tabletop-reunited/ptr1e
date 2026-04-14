import { automation } from './automation.js';
import { PTUActor, PTUTrainerActor, PTUPokemonActor, PTUCharacterSheet, PTUPokemonSheet } from '../../module/actor/index.js';
import { PTUItemProxy, PTUItem, PTUEffect, PTUEdge, PTUFeat, PTUMove, PTUSpecies, PTUSpeciesSheet, PTUItemItem, PTUCondition } from '../../module/item/index.js';
import { PTUItemSheet, PTUEffectSheet, PTUEdgeSheet, PTUFeatSheet, PTUMoveSheet } from '../../module/item/index.js';
import { PTUSkills } from '../../module/actor/index.js';
import { PTUCombat } from '../../module/combat/document.js';
import { levelProgression, typeEffectiveness, natureData, pokemonData, dbData, helpText } from './data/index.js';
import { pokeballStyles, pokeballShapes } from './data/pokeball-themes.js';
import { RuleElements } from '../../module/rules/index.js';
import { PTUPredicate } from '../../module/system/predication.js';
import { PTUActorProxy } from '../../module/actor/base.js';
import { Enricher } from '../../util/enricher.js';
import { sluggify } from '../../util/misc.js';
import tmData from './data/tms.js';
import { PTUPartySheet } from '../../module/apps/party/index.js';
import { PTUPokemonTrainingSheet } from '../../module/apps/pokemon-training/index.js';
import { ActiveEffectPTU } from '../../module/active-effect.js';
import { statusEffects } from './effects.js';
import { StatusEffects } from '../../module/canvas/status-effect.js';
import { PTUToken } from '../../module/canvas/token/index.js';
import { PTUSpeciesDragOptionsPrompt } from '../../module/apps/species-drag-in/sheet.js';
import { PTUSpeciesMassGenerator } from '../../module/apps/species-mass-generator/sheet.js';
import { PTUNpcQuickBuild } from '../../module/apps/npc-quick-build/sheet.js';
import { LevelUpForm } from '../../module/apps/level-up-form/sheet.js';
import { LevelUpData } from '../../module/apps/level-up-form/document.js';
import { AttackRoll } from '../../module/system/check/rolls/attack-roll.js';
import { CheckRoll } from '../../module/system/check/rolls/roll.js';
import { PTUChatLog } from '../../module/apps/sidebar/chatlog.js';
import { ChatMessagePTU, PTUChatMessageProxy } from '../../module/message/base.js';
import { DamageRoll } from '../../module/system/damage/roll.js';
import { DamageMessagePTU } from '../../module/message/damage.js';
import { AttackMessagePTU } from '../../module/message/attack.js';
import { PokeballItem } from '../../module/item/item/pokeball.js';
import { CaptureRoll } from '../../module/system/check/rolls/capture-roll.js';
import { InitiativeRoll } from '../../module/system/check/rolls/initiative-roll.js';
import { PTUCombatant } from '../../module/combat/combatant.js';
import { PTUCombatTrackerConfig } from '../../module/combat/config.js';
import { PTUCombatTracker } from '../../module/combat/tracker.js';
import { PTUTokenDocument } from '../../module/canvas/token/document.js';
import { PTUUser } from '../../module/user.js';
import { PTUContestMove } from '../../module/item/contestmove/document.js';
import { PTUContestMoveSheet } from '../../module/item/contestmove/sheet.js';
import { PTUHotBar } from '../../module/apps/hotbar.js';
import { PTUTokenConfig } from '../../module/canvas/token/sheet.js';
import { PackLoader } from '../../module/apps/compendium-browser/index.js';
import PTURuleBookJournal from '../../module/apps/rulebook-journal.js';
import { BaseEffectPTU } from '../../module/item/effect-types/base.js';

const data = {
  skills: {
    keys: [
      "acrobatics",
      "athletics",
      "charm",
      "combat",
      "command",
      "generalEd",
      "medicineEd",
      "occultEd",
      "pokemonEd",
      "techEd",
      "focus",
      "guile",
      "intimidate",
      "intuition",
      "perception",
      "stealth",
      "survival",
    ], PTUSkills
  },
  stats: {
    keys: [
      "hp",
      "atk",
      "def",
      "spatk",
      "spdef",
      "spd"
    ],
  },
  levelProgression,
  typeEffectiveness,
  natureData,
  sheetThemes: {
    styles: pokeballStyles,
    shapes: pokeballShapes,
    defaultStyle: pokeballStyles.default
  },
  dbData,
  helpText,
  tmData,
  alliances: ["party", "opposition", "neutral"],
  capture: {
    locationOptions: {
      "party": "PTU.Dialog.CaptureSuccess.PartyChoice.Party",
      "box": "PTU.Dialog.CaptureSuccess.PartyChoice.Box",
      "available": "PTU.Dialog.CaptureSuccess.PartyChoice.Available",
    }
  },
  contestTypes: {
    "cool": "PTU.Contests.Cool",
    "tough": "PTU.Contests.Tough",
    "beauty": "PTU.Contests.Beauty",
    "smart": "PTU.Contests.Smart",
    "cute": "PTU.Contests.Cute",
  },
  effects: {
    expiryOptions: {
      "turn-start": "ITEM.Duration.Expiry.TurnStart",
      "turn-end": "ITEM.Duration.Expiry.TurnEnd",
      "round-end": "ITEM.Duration.Expiry.RoundStart",
    },
    durationUnitOptions: {
      "unlimited": "ITEM.Duration.Unit.Unlimited",
      "encounter": "ITEM.Duration.Unit.Encounter",
      "rounds": "ITEM.Duration.Unit.Rounds",
    }
  },
  moves: {
    categories: {
      "Status": "PTU.Move.Category.Status",
      "Physical": "PTU.Move.Category.Physical",
      "Special": "PTU.Move.Category.Special",
    }
  },
  weather: {
    modeOptions: {
      "disabled": "PTU.Weather.Mode.Off",
      "players": "PTU.Weather.Mode.Players",
      "opposition": "PTU.Weather.Mode.Opposition",
      "all": "PTU.Weather.Mode.All"
    }
  },
  randomNames: {
    "Male": ["Liam", "Noah", "Oliver", "James", "Elijah", "Mateo", "Theodore", "Henry", "Lucas", "William", "Benjamin", "Levi", "Sebastian", "Jack", "Ezra", "Michael", "Daniel", "Leo", "Owen", "Samuel", "Hudson", "Alexander", "Asher", "Luca", "Ethan", "John", "David", "Jackson", "Joseph", "Mason"],
    "Female": ["Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Mia", "Isabella", "Ava", "Evelyn", "Luna", "Harper", "Sofia", "Camila", "Eleanor", "Elizabeth", "Violet", "Scarlett", "Emily", "Hazel", "Lily", "Gianna", "Aurora", "Penelope", "Aria", "Nora", "Chloe", "Ellie", "Mila", "Avery", "Layla"],
    "Nonbinary": ["Noah", "James", "Evelyn", "Harper", "Michael", "Logan", "Avery", "Madison", "Riley", "Jayden", "Ainsley", "Arden", "Dakota", "Finley", "Hayden", "Lennox", "Lindsey", "Robin", "Rowan", "Sloan", "Alexis", "Angel", "Briar", "Kirby", "Madhu", "Marley", "Morgan", "River", "Skyler", "Taylor"],
  }
}

const ui = {
//   combat: {
//     documentClass: PTUCombatTrackerOverrides
//   },
//   search: {
//     documentClass: PTUSearch
//   },
//   sidebar: {
//     documentClass: PTUSidebar
//   },
//   settings: {
//     documentClass: PTUSettings,
//     categories: PTUSettingCategories
//   },
//   changeLog: {
//     documentClass: ChangeLog
//   },
//   customSpeciesEditor: {
//     documentClass: PTUCustomSpeciesEditor
//   },
//   customTypingEditor: {
//     documentClass: PTUCustomTypingEditor
//   },
//   pokemonCharacterMancer: {
//     documentClass: PTUPokemonCharactermancer,
//   },
//   characterNotesForm: {
//     documentClass: PTUCharacterNotesForm
//   },
//   dexDragOptions: {
//     documentClass: PTUDexDragOptions
//   },
//   automationForm: {
//     documentClass: PTUAutomationForm
//   },
//   levelUpForm: {
//     documentClass: PTULevelUpForm
//   }
  party: {
    sheetClass: PTUPartySheet
  },
  pokemonTraining: {
    sheetClass: PTUPokemonTrainingSheet
  },
  speciesDragPrompt: {
    sheetClass: PTUSpeciesDragOptionsPrompt
  },
  speciesMassGenerator: {
    sheetClass: PTUSpeciesMassGenerator
  },
  npcQuickBuild: {
    sheetClass: PTUNpcQuickBuild
  },
  levelUpForm: {
    sheetClass: LevelUpForm,
    documentClass: LevelUpData
  },
  chatlog: {
    documentClass: PTUChatLog
  },
  hotbar: {
    documentClass: PTUHotBar
  }
}

const combat = {
  documentClass: PTUCombat,
  sheetClass: PTUCombatTrackerConfig,
  uiClass: PTUCombatTracker,
  defeatedStatusId: "effect.other.fainted",
  directionOptions: {
    backwards: -1,
    unchanged: 0,
    forward: 1,
  },
  attack: {
    physical: 3,
    special: 2,
    status: 1,
    none: 0,
  },
  dc: {
    paralyzed: 11,
    paralyzedPreErrata: 5,
    frozen: 16,
    frozenFireMod: -5,
    frozenHailMod: 2,
    frozenSunnyMod: -4,
    infatuation: 16,
    infatuationAfflicted: 10,
    infatuationNormal: 18,
    rage: 15,
    sleep: 16,
    confused: 16,
    confusedHitItself: 8,
    confusedNormal: 15,
  },
  initiative: {
    formula: "@initiative.value + (1d20 * 0.01)",
    decimals: 2
  }
};

export const PTUCONFIG = {
  automation,
  ActiveEffect: {
    documentClass: ActiveEffectPTU
  },
  statusEffects,
  StatusEffects,
  Actor: {
    documentClass: PTUActor,
    proxy: PTUActorProxy,
    documentClasses: {
      character: PTUTrainerActor,
      pokemon: PTUPokemonActor
    },
    sheetClasses: {
      character: PTUCharacterSheet,
      pokemon: PTUPokemonSheet
    }
  },
  Token: {
    objectClass: PTUToken,
    documentClass: PTUTokenDocument,
    sheetClass: PTUTokenConfig
  },
  tokenRulerColors: {
    normal: 0x4CAF50,
    double: 0xFFC107,
    triple: 0xF44336
  },
  tokenMovementCapabilityMap: {
    overland: "walk",
    swim: "swim",
    sky: "fly",
    levitate: "fly",
    longJump: "jump"
  },
  combat,
  combatant: {
    documentClass: PTUCombatant
  },
  data,
  Item: {
    documentClass: PTUItem,
    proxy: PTUItemProxy,
    documentClasses: {
      feat: PTUFeat,
      edge: PTUEdge,
      ability: PTUItem,
      move: PTUMove,
      contestmove: PTUContestMove,
      item: PTUItemItem,
      pokeball: PokeballItem,
      capability: PTUItem,
      pokeedge: PTUItem,
      dexentry: PTUItem,
      effect: PTUEffect,
      species: PTUSpecies,
      condition: PTUCondition,
      reference: PTUItem,
      spiritaction: PTUItem,
    },
    sheetClasses: {
      item: PTUItemSheet,
      edge: PTUEdgeSheet,
      feat: PTUFeatSheet,
      move: PTUMoveSheet,
      contestmove: PTUContestMoveSheet,
      effect: PTUEffectSheet,
      species: PTUSpeciesSheet,
    },
    baseEffect: BaseEffectPTU
  },
  Journal: {
    Rulebook: {
      journalClass: PTURuleBookJournal
    }
  },
  rule: {
    elements: RuleElements,
    predicate: PTUPredicate,
  },
  util: {
    Enricher,
    sluggify
  },
  ui,
  Dice: {
    rolls: [
      AttackRoll,
      CheckRoll,
      DamageRoll,
      CaptureRoll,
      InitiativeRoll
    ],
    rollDocuments: {
      attack: AttackRoll,
      check: CheckRoll,
      damage: DamageRoll,
      capture: CaptureRoll,
      initiative: InitiativeRoll
    }
  },
  ChatMessage: {
    documentClass: PTUChatMessageProxy,
    documentClasses: {
      attack: AttackMessagePTU,
      damage: DamageMessagePTU
    }
  },
  User: {
    documentClass: PTUUser
  },
  Capabilities: {
    numericNonMovement: ["highJump", "longJump", "power", "weightClass", "throwingRange"],
    stringArray: ["naturewalk", "other"],
  }
}