function extractModifiers(synthetics, selectors, options = {}) {
    const { modifierAdjustments, statisticsModifiers } = synthetics;
    const modifiers = Array.from(new Set(selectors))
        .flatMap((s) => statisticsModifiers[s] ?? [])
        .flatMap((d) => d(options) ?? []);
    for (const modifier of modifiers) {
        modifier.adjustments = extractModifierAdjustments(modifierAdjustments, selectors, modifier.slug);
    }

    return modifiers;
}

function extractModifierAdjustments(
    adjustmentsRecord,
    selectors,
    slug
) {
    const adjustments = Array.from(new Set(selectors.flatMap((s) => adjustmentsRecord[s] ?? [])));
    return adjustments.filter((a) => [slug, null].includes(a.slug));
}

function extractNotes(rollNotes, selectors) {
    return selectors.flatMap(s => (rollNotes[s] ?? []).map(n => n.clone()));
}

function extractDamageDice(deferredDice, selectors, options = {}) {
    return selectors
        .flatMap(s => deferredDice[s] ?? [])
        .flatMap(d => d(options) ?? []);
}

async function extractEphemeralEffects({ affects, origin, target, item, domains, options }) {
    if (!(origin && target)) return [];

    const [effectsFrom, effectsTo] = affects === "target" ? [origin, target] : [target, origin];
    const fullOptions = [...options, ...effectsTo.getSelfRollOptions(affects), ...(item?.getRollOptionsWithTarget?.(effectsFrom, domains) ?? [])];
    const resolvables = item?.type == "move" ? { move: item } : {};
    return (
        await Promise.all(
            domains
                .flatMap(s => effectsFrom.synthetics.ephemeralEffects[s]?.[affects] ?? [])
                .map(d => d({ test: fullOptions, resolvables }))
        )
    ).flatMap(e => e ?? [])
}

async function extractApplyEffects({ affects, origin, target, item, domains, options, roll }) {
    if (!(origin && target)) return [];

    const [effectsFrom, effectsTo] = affects === "target" ? [origin, target] : [target, origin];
    const fullOptions = [...options, ...effectsTo.getSelfRollOptions(affects), ...(item?.getRollOptionsWithTarget?.(effectsFrom, domains) ?? [])];
    const resolvables = item?.type == "move" ? { move: item } : {};
    return (
        await Promise.all(
            domains
                .flatMap(s => effectsFrom.synthetics.applyEffects[s]?.[affects] ?? [])
                .map(d => d({ test: fullOptions, resolvables, roll }))
        )
    ).flatMap(e => e ?? [])
}

function extractRollSubstitutions(substitutions, domains, rollOptions) {
    return domains
        .flatMap((d) => foundry.utils.deepClone(substitutions?.[d] ?? []))
        .filter((s) => s.predicate?.test(rollOptions) ?? true);
}

async function processPreUpdateActorHooks(changed, { pack }) {
    const actorId = String(changed._id);
    const actor = pack ? await game.packs.get(pack)?.getDocument(actorId) : game.actors.get(actorId);
    if (!(actor instanceof CONFIG.PTU.Actor.documentClass)) return;

    if (actor.prototypeToken.actorLink !== true) {
        changed.prototypeToken ??= {};
        changed.prototypeToken.actorLink = true;
    }

    // Run preUpdateActor rule element callbacks
    const rules = actor.rules.filter((r) => !!r.preUpdateActor);
    if (rules.length === 0) return;

    actor.flags.ptu.rollOptions = actor.clone(changed, { keepId: true }).flags.ptu.rollOptions;
    const createDeletes = (
        await Promise.all(
            rules.map(
                (r) =>
                    actor.items.has(r.item.id) ? r.preUpdateActor() : { create: [], delete: [] })
        )
    ).reduce(
        (combined, cd) => ({
            create: [...combined.create, ...cd.create],
            delete: Array.from(new Set([...combined.delete, ...cd.delete])),
        }),
        { create: [], delete: [] }
    );
    createDeletes.delete = createDeletes.delete.filter((id) => actor.items.has(id));

    await actor.createEmbeddedDocuments("Item", createDeletes.create, { keepId: true, render: false });
    await actor.deleteEmbeddedDocuments("Item", createDeletes.delete, { render: false });
}

export { extractEphemeralEffects, extractApplyEffects, extractDamageDice, extractNotes, extractModifierAdjustments, extractRollSubstitutions, extractModifiers, processPreUpdateActorHooks }

globalThis.extractEphemeralEffects = extractEphemeralEffects;
globalThis.extractDamageDice = extractDamageDice;
globalThis.extractNotes = extractNotes;
globalThis.extractModifierAdjustments = extractModifierAdjustments;
globalThis.extractRollSubstitutions = extractRollSubstitutions;
globalThis.extractModifiers = extractModifiers;
