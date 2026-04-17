[![foundry-shield]][foundry-url]
![Discord](https://img.shields.io/discord/748601513835888682?logo=discord&label=Discord&link=https%3A%2F%2Fdiscord.gg%2Fptufvtt)
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![All Release Downloads](https://img.shields.io/github/downloads/dylanpiera/Foundry-Pokemon-Tabletop-United-System/total.svg)]()

# PTR System
The Pokemon Tabletop Reunited system for FoundryVTT is a continuation of the Pokemon Tabletop United system, with balance changes, and new content, created with FoundryVTT in mind.

Feel free to open an issue or join our [Discord Server](https://discord.gg/ptrfvtt) for any questions & feedback.

## Contributing Content
To contribute content, please message @dylan.is.super.ok on Discord for contributor access to this repository. You can contribute either directly via Git (with a branch + pull request), or with the Content Sync system in this dev build.

## How to Install
#### Dev Build (V13)
If you would like to use this fast-releasing dev build with Content Sync features, import the following manifest into foundry:
```
https://github.com/righthandofvecna/fvtt-ptr/releases/latest/download/system.json
```

#### Release Build (V13)
If you would like to use the latest stable build, just import the following manifest into foundry: 
```
https://github.com/pokemon-tabletop-reunited/ptr1e/releases/latest/download/system.json
```

#### Legacy Build (V12)
If you would like to use the latest build for Foundry v12, just import the following manifest into foundry: 
```
https://github.com/righthandofvecna/fvtt-ptr/releases/download/4.3.7/system.json
```

#### PTU 1.05 (V10 - Not Recommended)
If you're looking for the Non-PTR version you can install the [PTU Branch](https://github.com/pokemon-tabletop-reunited/ptr1e/tree/PTU-1.05)
Please note that this branch is no longer receiving updates and is only compatible with Foundry v10.


## 🚨 Changes From Stable 🚨
- Redesigned Token Panel moved from Top Right to Bottom Right (near old position) beneath the sidebar
- Add `move:super-effective` and `move:not-very-effective` Roll Options
- [Fixed Keywords in Species Compendium Browser Tab](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/875)
- [Add Capabilities and Edges Tab to Token Panel](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/871)
- [Optional Contest Tabs](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/869)
- [Tab Scroll Position Not Being Lost On Edit](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/859)
- [Drag Ruler Coloring Based On Move Speed](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/858)
- [Purchasing Item Increases Quantity By Current Quantity](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/854)
- [Throwing Pokeballs to Catch Should Reduce Quantity](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/848)
- [Save Button on Character Sheet Triggering On Submit](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/846)
- [Tagify Not Defined Error](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/844)
- [Flat Bonuses Adding Twice](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/840)
- [Habitat and Egg Group Search in Compendium](https://github.com/pokemon-tabletop-reunited/ptr1e/issues/841)
- The addition of a basic Github-Foundry Item Sync system ("Commit to Github")
- Building out the Github-Foundry Item Sync system a bit more (auto-stages linked items, enforces them being in the compendium)
- Grey-on-grey text in chat fixed
- Tagify Dropdown Text Color Black
- Compendium Browser "Moves" tab loading
- **Lots of content fixes**


## Links & Recommendations
- [Quick Insert](https://gitlab.com/fvtt-modules-lab/quick-insert) is an amazing addon that allows you to drag & drop all over the place even more easily. We 1000% recommend using their module in conjuncture with our system!
- [Pokemon Assets](https://github.com/righthandofvecna/pokemon-assets) adds a bunch of Pokemon-specific automation and overworld sprites!
- [Wiki](https://1e.ptr.wiki)

## Special Thanks
* [cswendrowski](https://github.com/cswendrowski) for starting this project!
* https://www.theworldofpokemon.com/ for their amazing pokedex entries 
* The Amazing People and their amazing feedback, over at the [PTR Dev Server](https://discord.gg/ptrfvtt)

## Copyright
Pokémon © 2002-2023 Pokémon. © 1995-2023 Nintendo/Creatures Inc./GAME FREAK inc. TM, ® and Pokémon character names are trademarks of Nintendo.
No copyright or trademark infringement is intended in using Pokémon content for the PTU for FoundryVTT System.

[foundry-shield]: https://img.shields.io/badge/Foundry-v13.348-success
[foundry-url]: https://foundryvtt.com/
[forks-shield]: https://img.shields.io/github/forks/dylanpiera/Foundry-Pokemon-Tabletop-United-System.svg
[forks-url]: https://github.com/dylanpiera/Foundry-Pokemon-Tabletop-United-System/network/members
[stars-shield]: https://img.shields.io/github/stars/dylanpiera/Foundry-Pokemon-Tabletop-United-System.svg
[stars-url]: https://github.com/dylanpiera/Foundry-Pokemon-Tabletop-United-System/stargazers
[issues-shield]: https://img.shields.io/github/issues/dylanpiera/Foundry-Pokemon-Tabletop-United-System.svg
[issues-url]: https://github.com/dylanpiera/Foundry-Pokemon-Tabletop-United-System/issues
