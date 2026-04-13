export const TrainerPokemonSync = {
  listen() {
      // On game ready, ensure all Pokemon have correct level caps
      Hooks.on("ready", () => {          
          const pokemonWithTrainers = game.actors.filter(actor => 
              actor.type === "pokemon" && 
              actor.flags?.ptu?.party?.trainer
          );
          
          pokemonWithTrainers.forEach(pokemon => {
              try {
                  pokemon.reset();
              } catch (error) {
                  console.error(`PTU | Error initializing level caps for ${pokemon.name}:`, error);
              }
          });
      });

      Hooks.on("updateActor", (actor, updateData, options, userId) => {
          if (actor.type !== "character") return;
          
          const levelUpdated = foundry.utils.hasProperty(updateData, "system.level") ||
                              foundry.utils.hasProperty(updateData, "system.level.current") ||
                              foundry.utils.hasProperty(updateData, "system.level.milestones") ||
                              foundry.utils.hasProperty(updateData, "system.level.miscexp");
          
          if (!levelUpdated) return;
                    
          const trainerPokemon = game.actors.filter(pokemon => 
              pokemon.type === "pokemon" && 
              pokemon.flags?.ptu?.party?.trainer === actor.id
          );
          
          trainerPokemon.forEach(pokemon => {
              try {
                  pokemon.refreshPreparedData();
              } catch (error) {
                  console.error(`PTU | Error updating Pokemon ${pokemon.name}:`, error);
              }
          });
          
          Object.values(ui.windows).forEach(window => {
              if (window.constructor.name === "PTUPokemonTrainingSheet" && window.trainer?.id === actor.id) {
                  window.render(false);
              }
          });
      });
      
      // When Pokemon are added/removed from a trainer's party, refresh their data
      Hooks.on("updateActor", (actor, updateData, options, userId) => {
          if (actor.type !== "pokemon") return;
          
          const partyUpdated = foundry.utils.hasProperty(updateData, "flags.ptu.party");
          
          if (!partyUpdated) return;          
          actor.refreshPreparedData();
      });
  }
};
