export default class TokenRulerPTU extends foundry.canvas.placeables.tokens.TokenRuler {
  /** @inheritDoc */
  _getWaypointStyle(waypoint) {
    if (!waypoint.explicit && waypoint.next && waypoint.previous && waypoint.actionConfig?.visualize
      && waypoint.next.actionConfig?.visualize && (waypoint.action === waypoint.next.action)
      && (waypoint.unreachable || !waypoint.next.unreachable)) return { radius: 0 };
    const user = game.users.get(waypoint.userId);
    const scale = canvas.dimensions.uiScale;
    const style = { radius: 6 * scale, color: user?.color ?? 0x000000, alpha: waypoint.explicit ? 1 : 0.5 };
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /** @override */
  _getWaypointLabelContext(waypoint, state) {
    const { index, elevation, explicit, next, previous, ray } = waypoint;
    state.hasElevation ||= (elevation !== 0);
    if (!previous) {
      state.previousElevation = elevation;
      return;
    }
    if (!explicit && next && waypoint.actionConfig?.visualize && next.actionConfig?.visualize
      && (waypoint.action === next.action) && (waypoint.unreachable || !waypoint.next.unreachable)) return;
    if ((ray.distance === 0) && (elevation === previous.elevation)) return;

    const context = {
      action: waypoint.actionConfig,
      cssClass: [
        waypoint.hidden ? "secret" : "",
        waypoint.next ? "" : "last",
        explicit ? "" : "nonexplicit"
      ].filterJoin(" "),
      secret: waypoint.hidden,
      units: canvas.grid.units,
      uiScale: canvas.dimensions.uiScale,
      position: { x: ray.B.x, y: ray.B.y + (next ? 0 : 0.5 * this.token.h) + (16 * canvas.dimensions.uiScale) }
    };

    context.distance = { total: waypoint.measurement.distance.toNearest(0.01).toLocaleString(game.i18n.lang) };
    if (index >= 2) context.distance.delta = waypoint.measurement.backward.distance.toNearest(0.01).signedString();

    const cost = waypoint.measurement.cost;
    const deltaCost = waypoint.cost;
    context.cost = {
      total: Number.isFinite(cost) ? cost.toNearest(0.01).toLocaleString(game.i18n.lang) : "∞",
      units: canvas.grid.units
    };
    if (index >= 2) context.cost.delta = Number.isFinite(deltaCost) ? deltaCost.toNearest(0.01).signedString() : "∞";

    const deltaElevation = elevation - state.previousElevation;
    context.elevation = { total: elevation, icon: "fa-solid fa-arrows-up-down", hidden: !state.hasElevation };
    if (deltaElevation !== 0) context.elevation.delta = deltaElevation.signedString();
    state.previousElevation = elevation;

    return context;
  }

  /** @override */
  _getSegmentStyle(waypoint) {
    const style = super._getSegmentStyle(waypoint);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /** @override */
  _getGridHighlightStyle(waypoint, offset) {
    const style = super._getGridHighlightStyle(waypoint, offset);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  #getSpeedBasedStyle(waypoint, style) {
    try {
      if (!(game.user.id in this.token._plannedMovement) || (CONFIG.Token?.movement?.actions?.[waypoint.action]?.teleport)) return style;

      const movement = this.token.actor?.system?.capabilities;
      if (!movement) return style;

      const movementType = (()=>{
        const allOptions = Object.entries(CONFIG.PTU.tokenMovementCapabilityMap).filter(([key, value]) => (value === waypoint.action));
        // find the fastest movement type that can perform the current action
        return allOptions.reduce((fastest, [key, value]) => {
          if ((movement[key] ?? 0) > (movement[fastest] ?? 0)) return key;
          return fastest;
        }, "overland");
      })();

      // Determine the current action speed. Fall back to "overland" when missing.
      let currActionSpeed = movement[movementType] ?? movement.overland ?? 0;

      const { normal, double, triple } = CONFIG.PTU.tokenRulerColors ?? {};
      const increment = (waypoint.measurement.cost - 0.1) / Math.max(currActionSpeed, 0.000001);
      if (increment <= 1) style.color = normal ?? style.color;
      else if (increment <= 2) style.color = double ?? style.color;
      else style.color = triple ?? style.color;
    } catch (err) {
      // Swallow errors and return default style
    }
    return style;
  }
}
