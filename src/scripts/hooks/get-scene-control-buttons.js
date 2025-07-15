export const GetSceneControlButtons = {
    listen: () => {
        Hooks.on('getSceneControlButtons', function (hudButtons) {
            console.log('hudButtons ===>', hudButtons);
            const hud = hudButtons.tokens;
            console.log('hud ===>', hud);
            if (hud) {
              hud.tools["dexButton"] = {
                name: "dexButton",
                title: "PTU.DexButtonName",
                toolclip: { "heading": "PTU.DexButtonHintHeading", "items": [ { "content": "PTU.DexButtonHintContent" } ]},
                icon: "fas fa-tablet-alt",
                button: true,
                onClick: game.ptu.macros.pokedex
              }
              if(game.user.isGM) {
                hud.tools["weatherButton"] = {
                  name: "weatherButton",
                  title: "PTU.WeatherButtonName",
                  toolclip: { "heading": "PTU.WeatherButtonHintHeading", "items": [ { "content": "PTU.WeatherButtonHintContent" } ]},
                  icon: "fas fa-cloud-sun-rain",
                  button: true,
                  onClick: game.ptu.weather.openWeatherMenu
                }
              }
            }
          });
    },
};
