import { PTUPartySheet } from "../../apps/party/sheet.js";
import { Statistic } from "../../system/statistic/index.js";
import { PTUActorSheet } from "../sheet.js";
import { ItemSummaryRenderer } from "../sheet/item-summary.js";

export class PTUPokemonSheet extends PTUActorSheet {
	/** @override */
	static get defaultOptions() {
		const options = foundry.utils.mergeObject(super.defaultOptions, {
			classes: ['ptu', 'sheet', 'actor', 'gen8'],
			template: 'systems/ptu/static/templates/actor/pokemon-sheet.hbs',
			width: 1200,
			height: 640,
			tabs: [{
				navSelector: '.tabs',
				contentSelector: '.sheet-body',
				initial: 'stats'
			}],
			submitOnClose: true,
			submitOnChange: true,
			scrollY: [".sheet-body"]
		});

		// If compact style is enabled
		if (true) {
			options.classes.push('compact');
			options.template = 'systems/ptu/static/templates/actor/pokemon-sheet-compact.hbs';
			options.width = 900;
			options.height = 650;
		}

		return options;
	}

	get ballStyle() {
		if (this.actor.flags.ptu.theme) return this.actor.flags.ptu.theme;
		if (this.actor.system.pokeball) {
			const ball = this.actor.system.pokeball.toLowerCase().replace('ball', '').trim();
			if (ball == "basic" || ball == "poke") return "default";
			return ball;
		}
		return "default";
	}

	/** @override */
	async getData() {
		const data = await super.getData();
		data.dtypes = ['String', 'Number', 'Boolean'];

		// Prepare items.
		if (this.actor.type == 'pokemon') {
			await this._prepareCharacterItems(data);
		}

		data['natures'] = CONFIG.PTU.data.natureData;

		data["ballStyle"] = this.ballStyle;

		const IWR = this.actor.iwr;
		data.effectiveness = {
			weaknesses: [],
			resistances: [],
			immunities: []
		}
		for(const [type, value] of Object.entries(IWR.all)) {
			if(value === 0) {
				data.effectiveness.immunities.push({type: type.capitalize(), value: IWR.getRealValue(type)});
				continue;
			}
			if(value > 1) {
				data.effectiveness.weaknesses.push({type: type.capitalize(), value: IWR.getRealValue(type)});
				continue;
			}
			if(value < 1) {
				data.effectiveness.resistances.push({type: type.capitalize(), value: IWR.getRealValue(type)});
				continue;
			}
		}

		return data;
	}

	/** @override */
	_getHeaderButtons() {
		let buttons = super._getHeaderButtons();

		if (this.actor.isOwner) {
			buttons.unshift({
				label: "Party",
				class: "part-screen",
				icon: "fas fa-users",
				onclick: () => new PTUPartySheet({ actor: this.actor }).render(true)
			});
		}

		return buttons;
	}

	/**
	 * Organize and classify Items for Character sheets.
	 *
	 * @param {Object} actorData The actor to prepare.
	 *
	 * @return {undefined}
	 */
	async _prepareCharacterItems(sheetData) {
		sheetData['skills'] = this.actor.system.skills

		// Initialize containers.
		const abilities = [];
		const capabilities = [];
		const items = [];
		const edges = [];
		const effects = [];
		const conditions = this.actor.conditions;
		const contestmoves = [];
		const spiritactions = [];

		// Iterate through items, allocating to containers
		// let totalWeight = 0;
		for (let i of this.actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
			i.img = i.img || DEFAULT_TOKEN;

			switch (i.type) {
				case 'ability':
					abilities.push(i);
					break;
				case 'capability':
					capabilities.push(i);
					break;
				case 'pokeedge':
					edges.push(i);
					break;
				case 'effect':
					effects.push(i);
					break;
				case 'contestmove':
					contestmoves.push(i);
					break;
				case 'spiritaction':
					spiritactions.push(i);
					break;
				case 'item':
					items.push(i);
					break;
			}
		}

		// Assign and return
		sheetData.abilities = abilities;
		sheetData.capabilities = capabilities;
		sheetData.edges = edges;
		sheetData.effects = effects;
		sheetData.conditions = conditions;
		sheetData.contestmoves = contestmoves;
		sheetData.spiritactions = spiritactions;
		sheetData.items = items;

		sheetData.actions = await (async () => {
			const moves = [];
			const struggles = [];
			const effects = {};

			for (const statistic of this.actor.attacks) {
				if (statistic.item.system.isStruggle) struggles.push(statistic.item);
				else moves.push(statistic.item);

				const effect = statistic.item.system.effect + (statistic.item.effectReference ? "<br/></br>" + statistic.item.effectReference : "");
				//effects[statistic.item.id] = await TextEditor.enrichHTML(effect, {async: true});
			}

			return {
				moves: moves.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), struggles, effects
			}
		})();

		return sheetData;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		this._itemSummaryRenderer = new ItemSummaryRenderer(this);
		this._itemSummaryRenderer.activateListeners(html);

		$(html).find('nav .tooltip').tooltipster({
			theme: `tooltipster-shadow ball-themes ${this.ballStyle}`,
			position: 'right'
		});

		$(html).find('.tag.tooltip').tooltipster({
			theme: `tooltipster-shadow ball-themes ${this.ballStyle}`,
			position: 'top'
		});

		$(html).find('input[name="system.boss.bars"]').tooltipster({
			theme: `tooltipster-shadow ball-themes ${this.ballStyle}`,
			position: 'bottom',
			content: game.i18n.localize("PTU.BossBarTooltip")
		});

		$(html).find('.species.linked-item').each(async (i, element) => {
			await CONFIG.PTU.util.Enricher.enrichContentLinks(element);
		});

		for (const element of $(html).find(".mod-input")) {
			const $html = $(element)
			const $children = $html.find('.mod-tooltip');
			if ($children.length > 0) {
				$html.tooltipster({
					theme: `tooltipster-shadow ball-themes ${this.ballStyle}`,
					position: $children.data('position') || 'bottom',
					content: `<div class="mod-tooltip">${$children.html()}</div>`,
					contentAsHTML: true,
					interactive: true,
					functionReady: async (_instance, helper) => {
						const html = $(helper.tooltip).find('.linked-item');
						if (html.length > 0) {
							for (const element of html)
								await CONFIG.PTU.util.Enricher.enrichContentLinks(element);
						}
					}
				});
			}
		}

		// Everything below here is only needed if the sheet is editable
		if (!this.options.editable) return;

		html.find('.rollable.skill').click(this._onSkillRoll.bind(this));
		html.find('.rollable.move').click(async (event) => {
			const attackId = $(event.currentTarget).closest("li.item").data("item-id");
			const attack = this.actor.attacks.get(attackId);
			if (!attack) return;

			await attack.roll?.({
				event, callback: async (rolls, targets, msg, event) => {
					if (!game.settings.get("ptu", "autoRollDamage")) return;

					const params = {
						event,
						options: msg.context.options ?? [],
						actor: msg.actor,
						targets: msg.targets,
						rollResult: msg.context.rollResult ?? null,
					}
					const result = await attack.damage?.(params);
					if (result === null) {
						return await msg.update({ "flags.ptu.resolved": false })
					}
				}
			});
		});
		html.find('.rollable.save').click(this._onSaveRoll.bind(this));

		// Add Inventory Item
		html.find('.item-create').click(this._onItemCreate.bind(this));

		html.find('.item-enable').click((ev) => {
			const li = $(ev.currentTarget).parents('.item');
			/** @type {PTUItem} */
			const item = this.actor.items.get(li.data('itemId'));
			return item?.toggleEnableState?.();
		});

		html.find('.item-to-chat').click((ev) => {
			const li = $(ev.currentTarget).parents('.item');
			const item = this.actor.items.get(li.data('itemId'));
			return item?.sendToChat?.();
		});

		// Update Inventory Item
		html.find('.item-edit').click((ev) => {
			const li = $(ev.currentTarget).parents('.item');
			const item = this.actor.items.get(li.data('itemId'));
			item.sheet.render(true);
		});

		html.find(".item-quantity input[type='number']").change((ev) => {
			const value = Number(ev.currentTarget.value);
			const id = ev.currentTarget.dataset.itemId;
			if (value >= 0 && id) {
				const item = this.actor.items.get(id);
				item?.update({ "system.quantity": value });
			}
		});

		html.find('.item-delete').click(this._onItemDelete.bind(this));

		this._contextMenu(html);
	}

	_contextMenu(html) {
		// Convert jQuery object to HTMLElement for v13 compatibility
		const htmlElement = html instanceof jQuery ? html[0] : html;
		
		foundry.applications.ux.ContextMenu.implementation.create(this, htmlElement, ".move-item", [
			{
				name: "Roll",
				icon: '<i class="fas fa-dice"></i>',
				callback: this.#onMoveRoll.bind(this),
			},
			{
				name: "Send to Chat",
				icon: '<i class="fas fa-comment"></i>',
				callback: (ev) => {
					const li = ev.closest('.item');
					const itemId = li.dataset.itemId;
					const item = this.actor.items.get(itemId);
					return item?.sendToChat?.();
				}
			},
			{
				name: "Edit",
				icon: '<i class="fas fa-edit"></i>',
				callback: (ev) => {
					const li = ev.closest('.item');
					const itemId = li.dataset.itemId;
					const item = this.actor.items.get(itemId);
					item.sheet.render(true);
				}
			},
			{
				name: "Delete",
				icon: '<i class="fas fa-trash"></i>',
				callback: this._onItemDelete.bind(this),
			},
		], { jQuery: false })
	}

	/**
	 * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
	 * @param {Event} event   The originating click event
	 * @private
	 */
	_onItemCreate(event) {
		event.preventDefault();
		const header = event.currentTarget;
		// Get the type of item to create.
		const type = header.dataset.type;
		// Grab any data associated with this control.
		const data = foundry.utils.duplicate(header.dataset);
		// Initialize a default name.
		const name = `New ${game.i18n.localize(`TYPES.Item.${type}`)}`;
		// Prepare the item object.
		const itemData = {
			name: name,
			type: type,
			system: data
		};
		// Remove the type from the dataset since it's in the itemData.type prop.
		delete itemData.system['type'];

		if (itemData.type === "ActiveEffect") {
			throw new Error("ActiveEffects are not supported in PTU");
		}

		// Finally, create the item!
		console.debug("Created new item", itemData);
		return this.actor.createEmbeddedDocuments("Item", [itemData]);
	}

	/**
	 * Handle deleting an Owned Item for the actor.
	 * @param {Event} event   The originating click event
	 * @private
	 */
	_onItemDelete(event) {
		const li = $(event.currentTarget).parents('.item');
		const itemId = li.data('itemId');
		const item = this.actor.items.get(itemId);
		if (!item) throw new Error(`Item ${itemId} not found`);

		const deleteItem = async () => {
			await item.delete();
			li.slideUp(200, () => this.render(false));
		}
		if (event?.shiftKey) {
			return deleteItem();
		}


		const granter = this.actor.items.get(item.flags.ptu?.grantedBy?.id ?? "");
		if (granter) {
			const parentGrant = Object.values(granter?.flags.ptu?.itemGrants ?? {}).find((g) => g.id === item.id);

			if (parentGrant?.onDelete === "restrict") {
				return Dialog.prompt({
					title: game.i18n.localize("DIALOG.DeleteItem.Title"),
					content: game.i18n.format("DIALOG.DeleteItem.Restricted", { name: item.name, parentName: granter.name }),
				})
			}
		}


		new Dialog({
			title: game.i18n.localize("DIALOG.DeleteItem.Title"),
			content: game.i18n.format("DIALOG.DeleteItem.Content", { name: item.name }),
			buttons: {
				yes: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize("DIALOG.DeleteItem.Yes"),
					callback: deleteItem
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize("DIALOG.DeleteItem.Cancel"),
				}
			},
			default: 'yes'
		}).render(true);
	}

	/**
	 * Handle clickable rolls.
	 * @param {Event} event   The originating click event
	 * @private
	 */
	async _onSkillRoll(event) {
		event.preventDefault();
		const skill = event.currentTarget.dataset.skill;
		await this.actor.attributes.skills[skill].roll();
	}

	async _onSaveRoll(event) {
		event.preventDefault();
		if (event.screenX == 0 && event.screenY == 0) return;

		const statistic = new Statistic(this.actor, {
			slug: "save-check",
			label: game.i18n.format("PTU.SaveCheck", { name: this.actor.name, save: "" }),
			check: { type: "save-check", domains: ["save-check"], modifiers: [] },
			//dc: { modifiers: [], domains: ["save-dc"] },
			domains: []
		});
		return await statistic.roll({ skipDialog: false })
	}

	#onMoveRoll(event) {
		event.preventDefault();

		const li = $(event.currentTarget).parents('.item');
		const itemId = li.data('itemId');
		const item = this.actor.items.get(itemId);
		if (!item) throw new Error(`Item ${itemId} not found`);
		if (item.type !== "move") throw new Error(`Item ${itemId} is not a move`);

		return this._onMoveRoll(item, { event });
	}

	async _onMoveRoll(move, { event } = {}) {
		if (!move) return;
		if (move.type !== "move") throw new Error(`Item ${itemId} is not a move`);

		if (event?.ctrlKey) {
			return move?.sendToChat?.();
		}

		const bonus = [];
		if (event?.shiftKey) {
			const extra = await new Promise((resolve, reject) => {
				Dialog.confirm({
					title: `Accuracy Modifier`,
					content: `<input type="text" name="accuracy-modifier" value="0"></input>`,
					yes: async (html) => {
						const bonusTxt = html.find('input[name="accuracy-modifier"]').val()

						const bonus = !isNaN(Number(bonusTxt)) ? Number(bonusTxt) : parseInt((await (new Roll(bonusTxt)).roll()).total);
						if (!isNaN(bonus)) {
							return resolve(bonus);
						}
						return reject();
					}
				});
			});
			if (extra) {
				bonus.push({
					value: extra,
					label: `with ${extra} accuracy modifier`
				})
			}
		}

		if (event?.altKey) {
			//TODO: Implement using AP for pokemon; currently there is no link between trainer & pokemon
		}

		return move.execute({ bonus });
	}
}