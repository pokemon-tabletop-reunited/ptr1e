import { ItemSummaryRenderer } from "../sheet/item-summary.js";
import { InventoryConfigSheet } from "../sheet/inventory-config.js";
import { PTUPartySheet } from "../../apps/party/sheet.js";
import { Statistic } from "../../system/statistic/index.js";
import { PTUDexSheet } from "../../apps/dex/sheet.js";
import { PTUActorSheet } from "../sheet.js";

export class PTUCharacterSheet extends PTUActorSheet {

	/** @override */
	static get defaultOptions() {
		const options = foundry.utils.mergeObject(super.defaultOptions, {
			classes: ['ptu', 'sheet', 'actor', 'gen8'],
			template: 'systems/ptu/static/templates/actor/trainer-sheet.hbs',
			width: 1200,
			height: 635,
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
			options.template = 'systems/ptu/static/templates/actor/trainer-sheet-compact.hbs';
			options.width = 900;
			options.height = 650;
		}

		return options;
	}

	get ballStyle() {
		return this.actor.flags.ptu.theme || "default";
	}

	/* -------------------------------------------- */

	/** @override */
	async getData() {
		const data = await super.getData();
		data.dtypes = ['String', 'Number', 'Boolean'];

		// Prepare items.
		if (this.actor.type == 'character') {
			// TODO: make this pure
			await this._prepareCharacterItems(data);
		}
		// TODO: merge this into _prepareCharacterItems
		data['totalWealth'] = this.actor.itemTypes.item.reduce((total, item) => total + (!isNaN(Number(item.system.cost)) ? Number(item.system.cost) * (Number(item.system.quantity) ?? 0) : 0), Number(this.actor.system.money));

		data["ballStyle"] = this.ballStyle;

		// Setup Item Columns
		if (this.actor.getFlag("ptu", "itemColumns") === undefined) {
			const columns = { one: ["Key", "Medical", "Misc"], two: ["Pokemon Items", "PokeBalls", "TMs", "Money"], available: ["Equipment", "Food"] };
			this.actor.setFlag("ptu", "itemColumns", columns)
			data.columns = columns;
		}
		else data.columns = this.actor.getFlag("ptu", "itemColumns");

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
				class: "party-screen",
				icon: "fas fa-users",
				onclick: () => new PTUPartySheet({ actor: this.actor }).render(true)
			});
			buttons.unshift({
				label: "Dex",
				class: "dex-screen",
				icon: "fas fa-tablet-alt",
				onclick: () => new PTUDexSheet(this.actor, this.ballStyle).render(true)
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

		const actor = sheetData.actor;

		// Initialize containers.
		const feats = [];
		const edges = [];
		const items = [];
		const items_categorized = {
			"Key": [],
			"Medical": [],
			"Food": [],
			"Equipment": [],
			"Pokemon Items": [],
			"PokeBalls": [],
			"TMs": [],
			"Misc": []
		};
		const abilities = [];
		const capabilities = [];
		const effects = [];
		const conditions = this.actor.conditions;
		const contestmoves = [];

		// Iterate through items, allocating to containers
		// let totalWeight = 0;
		for (const item of this.actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
			if (item.type == 'item') {
				let cat = item.system.category;
				if (cat === undefined || cat == "") {
					cat = "Misc";
				}
				if (!(items_categorized[cat])) {
					//Category needs handling
					items_categorized[cat] = [];
				}
				items_categorized[cat].push(item);
			}
			switch (item.type) {
				case 'feat': feats.push(item); break;
				case 'edge': edges.push(item); break;
				case 'item': items.push(item); break;
				case 'ability': abilities.push(item); break;
				case 'capability': capabilities.push(item); break;
				case 'effect': effects.push(item); break;
				case 'contestmove': contestmoves.push(item); break;
			}
		}

		for (const category of Object.keys(items_categorized)) {
			if (actor.system.item_categories[category] === undefined) actor.system.item_categories[category] = true;
		}

		// Assign and return
		sheetData.feats = feats;
		sheetData.edges = edges;
		sheetData.inventory = items;
		sheetData.items_categorized = items_categorized;
		sheetData.abilities = abilities;
		sheetData.capabilities = capabilities;
		sheetData.effects = effects;
		sheetData.conditions = conditions;
		sheetData.contestmoves = contestmoves;

		sheetData.actions = await (async () => {
			const moves = [];
			const struggles = [];
			const effects = {}

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

	/* -------------------------------------------- */

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

		// Open Inventory Config
		html.find('.item-control.item-settings').click((ev) => {
			const config = new InventoryConfigSheet(this);
			config.render(true);
		});

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

		html.find('.item .item-icon.rollable').click((event) => {
			event.preventDefault();
			const itemId = $(event.currentTarget).closest("li.item").data("item-id");
			const item = this.actor.items.get(itemId);
			if (!item) return;

			return item.roll?.(event);
		})

		// Add Inventory Item
		html.find('.item-create').click(this._onItemCreate.bind(this));

		html.find('.collapse-sub-items').click(async (ev) => {
			if (this.transitioning) return;
			const target = $(ev.currentTarget).parent(".item-controls").parent(".item-info").siblings(".nested-items")[0];
			const icon = $(ev.target)[0]
			const showItems = !target.classList.contains("show");

			if (showItems) {
				target.classList.remove("hide");
				target.classList.add("show");
				icon.classList.remove("fa-plus-square");
				icon.classList.add("fa-minus-square");
			}
			else {
				this.transitioning = true;
				icon.classList.remove("fa-minus-square");
				icon.classList.add("fa-plus-square");
				target.classList.remove("show");
				target.classList.add("transitioning");
				await new Promise(resolve => setTimeout(resolve, 400));
				target.classList.remove("transitioning");
				target.classList.add("hide");
				this.transitioning = false;
			}
		});

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

		html.find(".item-quantity input[type='number']").change((ev) => {
			const value = Number(ev.currentTarget.value);
			const id = ev.currentTarget.dataset.itemId;
			if (value >= 0 && id) {
				const item = this.actor.items.get(id);
				item?.update({ "system.quantity": value });
			}
		});

		// Update Inventory Item
		html.find('.item-edit').click((ev) => {
			const li = $(ev.currentTarget).parents('.item');
			const item = this.actor.items.get(li.data('itemId'));
			item.sheet.render(true);
		});

		html.find('.item-delete').click(this._onItemDelete.bind(this));

		html.find('.ap-range').change((e) => {
			e.preventDefault();
			const value = parseInt(e.currentTarget.value);
			if (isNaN(value)) return;
			this.actor.update({
				"system.ap.value": value
			});
		});

		html.find('.voltage-range').change((e) => {
			e.preventDefault();
			const value = parseInt(e.currentTarget.value);
			if (isNaN(value)) return;
			this.actor.update({
				"system.contests.voltage.value": value
			});
		});
	}

	_updateItemField(e) {
		e.preventDefault();

		const t = e.currentTarget;
		let value;
		if ($(t).prop("type") === "checkbox") {
			value = $(t).prop("checked");
		} else {
			value = $(t).val();
		}

		const id = $(t).data("item-id");
		const binding = $(t).data("binding");


		const item = this.actor.items.get(id);
		const updateParams = {};
		updateParams[binding] = value;
		if (item) { item.update(updateParams, {}); }
	}

	/* -------------------------------------------- */

	/** @override */
	async _onDropItem(event, data) {
		if (!this.actor.isOwner) return false;

		const item = await Item.implementation.fromDropData(data);
		const itemData = item.toObject();

		const category = $(event.target).closest(".color-wrapper").data("category");

		const dropTarget = event.target?.closest("[data-item-id]");
		if (item.category === "feat" && dropTarget) {
			const target = this.actor.items.get(dropTarget.dataset.itemId);
			const source = this.actor.items.get(itemData._id);
			if (!source?.isGranted && target?.isClass && itemData.system.class != target.name) {
				await source?.update({ "system.class": target.name })
			}
			else if (!source?.isGranted && !target?.isClass && itemData.system.class) {
				await source?.update({ "system.class": null })
			}
		}
		if (item.type === "item" && dropTarget) {
			let target = this.actor.items.get(dropTarget.dataset.itemId);
			if (target?.isContainer === false && target.grantedBy?.id) {
				const parent = this.actor.items.get(target.grantedBy.id);
				if (parent?.isContainer) {
					target = parent;
				}
			}

			const source = this.actor.items.get(itemData._id);
			if (!source?.isGranted && target?.isContainer && source?.flags?.ptu?.grantedBy?.id != target.id) {
				await source?.update({ "flags.ptu.grantedBy": { id: target.id, onDelete: "detach" } })
			}
			else if (source?.flags?.ptu?.grantedBy?.id && !target?.isContainer) {
				await source?.update({ "flags.ptu.-=grantedBy": null })
			}
		}

		// Handle item sorting within the same Actor
		if (this.actor.uuid === item.parent?.uuid) {
			if (category && item.type === "item" && item.system.category != category) {
				await item.update({ "system.category": category });
			}

			return this._onSortItem(event, itemData);
		}

		// If duplicate item gets added instead increase the quantity
		const existingItem = this.actor.items.getName(item.name);
		if (existingItem && existingItem.id != item.id && existingItem.system.quantity) {
			const quantity = foundry.utils.duplicate(existingItem.system.quantity);
			await existingItem.update({ "system.quantity": Number(quantity) + (item.system.quantity > 0 ? Number(item.system.quantity) : 1) });
			return false;
		}

		if (category) {
			if (itemData.type == "item" && itemData.system.category != category) {
				itemData.system.category = category;
			}
		}

		// Create the owned item
		return this._onDropItemCreate(itemData);
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

		if (item.flags.ptu?.itemGrants) {
			for (const grant of Object.values(item.flags.ptu.itemGrants)) {
				const grantee = this.actor.items.get(grant.id);
				if (grantee && grantee.flags.ptu.grantedBy.onDelete === "restrict") {
					return Dialog.prompt({
						title: game.i18n.localize("DIALOG.DeleteItem.Title"),
						content: game.i18n.format("DIALOG.DeleteItem.Restricted", { name: item.name, parentName: grantee.name }),
					})
				}
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