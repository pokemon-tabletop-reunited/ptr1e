export const statusEffects = [
    {
        "id": "fainted",
        "name": "PTU.ConditionFainted",
        "img": "systems/ptu/static/images/conditions/Fainted.svg",
        "changes": [
            {
                "key": "flags.ptu.is_fainted",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "burned",
        "name": "PTU.ConditionBurned",
        "img": "systems/ptu/static/images/conditions/Burned.svg",
        "changes": [
            {
                "key": "flags.ptu.is_burned",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "system.stats.def.stage.mod",
                "value": -2,
                "mode": 2,
                "priority": 10
            }
        ]
    },
    {
        "id": "frozen",
        "name": "PTU.ConditionFrozen",
        "img": "systems/ptu/static/images/conditions/Frozen.svg",
        "changes": [
            {
                "key": "flags.ptu.is_frozen",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "paralysis",
        "name": "PTU.ConditionParalysis",
        "img": "systems/ptu/static/images/conditions/Paralysis.svg",
        "changes": [
            {
                "key": "flags.ptu.is_paralyzed",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "poisoned",
        "name": "PTU.ConditionPoisoned",
        "img": "systems/ptu/static/images/conditions/Poisoned.svg",
        "changes": [
            {
                "key": "flags.ptu.is_poisoned",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "badly-poisoned",
        "name": "PTU.ConditionBadlyPoisoned",
        "img": "systems/ptu/static/images/conditions/Badly-Poisoned.svg",
        "changes": [
            {
                "key": "flags.ptu.is_poisoned",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_badly_poisoned",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "confused",
        "name": "PTU.ConditionConfused",
        "img": "systems/ptu/static/images/conditions/Confused.svg",
        "changes": [
            {
                "key": "flags.ptu.is_confused",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "cursed",
        "name": "PTU.ConditionCursed",
        "img": "systems/ptu/static/images/conditions/Cursed.svg",
        "changes": [
            {
                "key": "flags.ptu.is_cursed",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "disabled",
        "name": "PTU.ConditionDisabled",
        "img": "systems/ptu/static/images/conditions/Disabled.svg",
        "changes": [
            {
                "key": "flags.ptu.is_disabled",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "flinch",
        "name": "PTU.ConditionFlinch",
        "img": "systems/ptu/static/images/conditions/Flinched.svg",
        "changes": [
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_flinched",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "infatuation",
        "name": "PTU.ConditionInfatuation",
        "img": "systems/ptu/static/images/conditions/Infatuated.svg",
        "changes": [
            {
                "key": "flags.ptu.is_infatuated",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "rage",
        "name": "PTU.ConditionRage",
        "img": "systems/ptu/static/images/conditions/Rage.svg",
        "changes": [
            {
                "key": "flags.ptu.is_raging",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "sleep",
        "name": "PTU.ConditionSleep",
        "img": "systems/ptu/static/images/conditions/Sleep.svg",
        "changes": [
            {
                "key": "flags.ptu.is_sleeping",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "bad-sleep",
        "name": "PTU.ConditionBadSleep",
        "img": "systems/ptu/static/images/conditions/Bad-Sleep.svg",
        "changes": [
            {
                "key": "flags.ptu.is_badly_sleeping",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "suppressed",
        "name": "PTU.ConditionSuppressed",
        "img": "systems/ptu/static/images/conditions/Suppressed.svg",
        "changes": [
            {
                "key": "flags.ptu.is_suppressed",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "blindness",
        "name": "PTU.ConditionBlindness",
        "img": "systems/ptu/static/images/conditions/Blindness.svg",
        "changes": [
            {
                "key": "flags.ptu.is_blind",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "system.modifiers.acBonus.mod",
                "value": -6,
                "mode": 2,
                "priority": 30
            }
        ]
    },
    {
        "id": "total-blindness",
        "name": "PTU.ConditionTotalBlindness",
        "img": "systems/ptu/static/images/conditions/Total-Blindness.svg",
        "changes": [
            {
                "key": "flags.ptu.is_blind",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_totally_blind",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "system.modifiers.acBonus.mod",
                "value": -10,
                "mode": 2,
                "priority": 30
            }
        ]
    },
    {
        "id": "slowed",
        "name": "PTU.ConditionSlowed",
        "img": "systems/ptu/static/images/conditions/Slowed.svg",
        "changes": [
            {
                "key": "flags.ptu.is_slowed",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "stuck",
        "name": "PTU.ConditionStuck",
        "img": "systems/ptu/static/images/conditions/Stuck.svg",
        "changes": [
            {
                "key": "flags.ptu.is_stuck",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "trapped",
        "name": "PTU.ConditionTrapped",
        "img": "systems/ptu/static/images/conditions/Trapped.svg",
        "changes": [
            {
                "key": "flags.ptu.is_trapped",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "tripped",
        "name": "PTU.ConditionTripped",
        "img": "systems/ptu/static/images/conditions/Tripped.svg",
        "changes": [
            {
                "key": "flags.ptu.is_tripped",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "vulnerable",
        "name": "PTU.ConditionVulnerable",
        "img": "systems/ptu/static/images/conditions/Vulnerable.svg",
        "changes": [
            {
                "key": "flags.ptu.is_vulnerable",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "tagged",
        "name": "PTU.ConditionTagged",
        "img": "systems/ptu/static/images/conditions/Tagged.svg",
        "changes": [
            {
                "key": "flags.ptu.is_tagged",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "cheered",
        "name": "PTU.ConditionCheered",
        "img": "systems/ptu/static/images/conditions/Cheered.svg",
        "changes": [
            {
                "key": "flags.ptu.is_cheered",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "vortex",
        "name": "PTU.ConditionVortex",
        "img": "systems/ptu/static/images/conditions/Vortex.svg",
        "changes": [
            {
                "key": "flags.ptu.is_stuck_in_vortex",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_slowed",
                "value": true,
                "mode": 5,
                "priority": 50
            },
            {
                "key": "flags.ptu.is_trapped",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    },
    {
        "id": "seeded",
        "name": "PTU.ConditionSeeded",
        "img": "systems/ptu/static/images/conditions/Seeded.svg",
        "changes": [
            {
                "key": "flags.ptu.is_seeded",
                "value": true,
                "mode": 5,
                "priority": 50
            }
        ]
    }
];