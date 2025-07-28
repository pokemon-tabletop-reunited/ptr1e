export const RenderTokenHUD = {
    listen: () => {
        Hooks.on("renderTokenHUD", (_app, $html, data) => {
            const rightCol = $html.querySelector(".col.right");
            game.ptu.StatusEffects.onRenderTokenHUD(rightCol, data);
        });
        Hooks.once("ready", _ => {
            canvas.tokens.hud.refreshStatusIcons = () => {};
        }) 
    },
};
