class PTUCombat extends Combat {
    get expBudget() {
        let budget = 0;
        for(const combatant of this.combatants) {
            const token = combatant.token;
            const actor = combatant.actor;
            if(!actor || !token) continue;
            if(actor.hasPlayerOwner) continue;
            if(token.disposition >= 0) continue;

            const level = actor.attributes.level.current;
            budget += actor.type === "character" ? level + level : level;
        }
        return budget;
    }

    /** @override */
    _sortCombatants(a, b) {
        const leagueBattle = game.settings.get("ptu", "leagueBattle");
        
        const resolveTie = () => {
            const [priorityA, priorityB] = [a, b].map(
                (combatant) => ({
                    one: combatant.actor.system.stats.spd.total,
                    two: combatant.actor.system.stats.spd.levelUp,
                    three: combatant.actor.system.stats.spd.value,
                    four: combatant.actor.system.level.current
                }));

            return priorityA.one === priorityB.one
                ? priorityA.two === priorityB.two
                    ? priorityA.three === priorityB.three
                        ? priorityA.four === priorityB.four
                            ? a.id.localeCompare(b.id)
                            : priorityB.four - priorityA.four
                        : priorityB.three - priorityA.three
                    : priorityB.two - priorityA.two
                : priorityB.one - priorityA.one;
        }

        if (leagueBattle) {
            const [isTrainerA, isTrainerB] = [a, b].map((combatant) => combatant.actor instanceof CONFIG.PTU.Actor.documentClasses.character);
            return isTrainerA && isTrainerB && isTrainerA === isTrainerB
                ? typeof a.initiative === "number" && typeof b.initiative === "number" && a.initiative === b.initiative
                    ? resolveTie() * -1
                    : super._sortCombatants(a, b) * -1
                : isTrainerA && !isTrainerB
                    ? -1
                    : !isTrainerA && isTrainerB
                        ? 1
                        : typeof a.initiative === "number" && typeof b.initiative === "number" && a.initiative === b.initiative
                            ? resolveTie()
                            : super._sortCombatants(a, b);
        }
        else {
            return typeof a.initiative === "number" && typeof b.initiative === "number" && a.initiative === b.initiative
                ? resolveTie()
                : super._sortCombatants(a, b);
        }
    }

    /** @override */
    getCombatantWithHigherInit(a, b) {
        const sortResult = this._sortCombatants();
        return sortResult > 0 ? b : sortResult < 0 ? a : null;
    }

    /** @override */
    async createEmbeddedDocuments(embeddedName = "Combatant", data, context = {}) {
        const createData = data.filter((datum) => {
            const token = canvas.tokens.placeables.find((canvasToken) => canvasToken.id === datum.tokenId);
            if (!token) return false;

            const { actor } = token;
            if (!actor) {
                ui.notifications.warn(`${token.name} has no associated actor.`);
                return false;
            }

            // TODO: Add actor types that cannot be part of combat here

            return true;
        })
        return super.createEmbeddedDocuments(embeddedName, createData, context);
    }

    /** @override */
    async rollInitiative(ids, options = {}) {
        const extraRollOptions = options.extraRollOptions ?? [];
        const rollMode = options.messageOptions?.rollMode ?? options.rollMode ?? game.settings.get("core", "rollMode");
        if (options.secret) extraRollOptions.push("secret");

        const combatants = ids.flatMap(
            (id) => this.combatants.get(id) ?? []
        );
        const fightyCombatants = combatants.filter((c) => !!c.actor?.initiative);

        // For boss combatants, always redirect to the primary turn and deduplicate so we only
        // roll once per boss regardless of which turn's dice button was clicked.
        const seenTokenIds = new Set();
        const rollingCombatants = fightyCombatants.flatMap((combatant) => {
            if (combatant.isBoss) {
                const primary = combatant.bossTurns?.mainTurn ?? combatant;
                const key = combatant.tokenId ?? combatant.actorId;
                if (seenTokenIds.has(key)) return [];
                seenTokenIds.add(key);
                return [primary];
            }
            return [combatant];
        });

        const rollResults = await Promise.all(
            rollingCombatants.map(async (combatant) => {
                const result = await combatant.actor.initiative?.roll({
                    ...options,
                    extraRollOptions,
                    updateTracker: false,
                    rollMode,
                }) ?? null;
                return { combatant, result };
            })
        );

        const initiatives = rollResults.flatMap(({ combatant, result }) => {
            if (!result) return [];

            if (combatant.isPrimaryBossCombatant) {
                const { otherTurns } = combatant.bossTurns;
                const results = [{ id: combatant.id, value: result.roll.total }];

                // For each other turn, add an initiative value that is 5 less than the previous
                // If the value is less than 0, instead start adding 5 more than the previous, restarting from 5 + base value
                for (let i = 1; i <= otherTurns.length; i++) {
                    const init = result.roll.total - 5 * i;
                    const actualInit = init >= 0 ? init : result.roll.total + -5 * (Math.ceil(init / 5) - 1)
                    results.push({
                        id: otherTurns[i - 1].id,
                        value: actualInit
                    });
                }
                return results;
            }
            return [{ id: combatant.id, value: result.roll.total }];
        });

        await this.setMultipleInitiatives(initiatives);

        // Roll the rest with the parent method
        const remainingIds = ids.filter((id) => !fightyCombatants.some((c) => c.id === id));
        return super.rollInitiative(remainingIds, options);
    }

    async setMultipleInitiatives(initiatives) {
        const currentId = this.combatant?.id
        const updates = initiatives.map(({ id, value }) => ({
            _id: id,
            initiative: value
        }));
        await this.updateEmbeddedDocuments("Combatant", updates);
        // Ensure the current turn is preserved
        if (currentId) await this.update({ turn: this.turns.findIndex((c) => c.id === currentId) });
    }

    async resetActors() {
        for (const actor of this.combatants.contents.flatMap(c => c.actor ?? [])) actor.reset();
    }

    /** @override */
    async nextTurn() {
        const turn = this.turn ?? -1;

        // Determine the next turn number
        let next = null;
        for (let [i, t] of this.turns.entries()) {
            if (i == turn) continue;
            if (t.hasActed) continue;
            if (this.settings.skipDefeated && t.isDefeated) continue;
            next = i;
            break;
        }

        // Maybe advance to the next round
        let round = this.round;
        if ((this.round === 0) || (next === null) || (next >= this.turns.length)) {
            return this.nextRound();
        }

        // Update the document, passing data through a hook first
        const updateData = { round, turn: next };
        const updateOptions = { advanceTime: CONFIG.time.turnTime, direction: 1 };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    /** @override */
    _onUpdate(changed, options, userId) {
        super._onUpdate(changed, options, userId);

        if (!this.started) return;

        const { combatant, previous } = this;
        const [newRound, newTurn] = [changed.round, changed.turn];
        const isRoundChange = typeof newRound === "number";
        const isTurnChange = typeof newTurn === "number";
        const isNewTurnUnacted = isTurnChange && this.turns[newTurn]?.hasActed === false;
        const isNextRound = isRoundChange && (previous.round === null || newRound > previous.round);
        const isNextTurn = isTurnChange && (previous.turn === null || newTurn > previous.turn || isNewTurnUnacted);

        // End early if no change
        if (!(isRoundChange || isTurnChange)) return;

        Promise.resolve().then(async () => {
            if (isNextRound || isNextTurn) {
                const previousCombatant = this.combatants.get(previous.combatantId ?? "");
                // Only the primary updater of the previous actor can end their turn
                if (game.user === previousCombatant?.actor?.primaryUpdater) {
                    const alreadyWent = previousCombatant.roundOfLastTurnEnd === previous.round //|| previousCombatant.bossTurns?.mainTurn.roundOfLastTurnEnd === previous.round;
                    if (typeof previous.round === "number" && !alreadyWent) {
                        await previousCombatant.endTurn({ round: previous.round });
                    }
                }

                // Only the primary updater of the current actor can start their turn
                if (game.user === combatant?.actor?.primaryUpdater) {
                    const alreadyWent = combatant?.roundOfLastTurn === this.round || combatant?.bossTurns?.mainTurn.roundOfLastTurn === this.round;
                    if (combatant && !alreadyWent) {
                        await combatant.startTurn();
                    }
                }
            }

            // Reset all data to get updated encounter roll options
            this.resetActors();
            await game.ptu.effectTracker.refresh();
            game.ptu.tokenPanel.refresh();
        });
    }

    /** @override */
    _onDelete(options, userId) {
        super._onDelete(options, userId);

        if (this.started) {
            Hooks.callAll("ptu.endTurn", this.combatant ?? null, this, userId);
            game.ptu.effectTracker.onEncounterEnd(this);
        }

        game.user.targets.clear();

        // Clear encounter-related roll options
        this.resetActors();
    }

    async _manageTurnEvents(adjustedTurn) {
        if (this.previous || game.release.build >= 308)
            return super._manageTurnEvents(adjustedTurn);
    }
}

export { PTUCombat }