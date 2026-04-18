export const ItemPilesHooks = {
    listen() {
        Hooks.on("item-piles-preDropItemDetermined", function(a, b, dropped_item, d) {
            if(dropped_item.item.type != "item")
            {
                return false; // Cancel Item Piles dialogue if the dragged item is not a 'real' item.
            }
        });

        Hooks.on("item-piles-createItemPile", async function(created_token, options) {

            // check if the item pile being created is a pile or not (chest, vault, merchant are other possibilities)
            // let flags = created_token?.data?.actorData?.flags;
            
            // Set the name of the item pile to be either the name of the item, or a fallback generic name,
            // set the image (have to do it here, not earlier, since we can't do async fetches for item images
            // in time until the token exists), and set a flag in case Token Tooltip Alt is being used that 
            // marks the item pile as a token that should not have the usual tooltips.
            //
            // only activates if the pile is an item pile, and not if the pile is a chest, vault, or merchant
            /*
            if(flags["item-piles"]?.data?.type == "pile") {
                let pile_name = created_token?.data?.actorData?.items?.[0]?.name ?? "Pile of Items";
                let new_image = await GetItemArt(pile_name);
                await created_token.update({
                    "name": pile_name, 
                    "img": ( new_image )
                });
            }
            */
            await created_token.update({
                "flags.token-tooltip-alt.noTooltip":true
            });
            
            // await created_token.data.actorData.items[0].update({ // TODO: Figure out how to update the actual items within the unlinked actor that get created here, since they don't trip the createItem hook
            //     "img": ( new_image )
            // });
        });
        
        Hooks.on("createItem", async function(ptu_item, options, id) {
    
            if((game.userId != id) || (ptu_item?.type != "item")) {return true;}
        
            let item_name = ptu_item?.name ?? "Generic Item";
            item_name = item_name.replace("Thrown ","").replace("Broken ","");
            let item_current_img = ptu_item?.img;
        
            if((item_current_img == "icons/svg/mystery-man.svg") || (item_current_img == "icons/svg/item-bag.svg") || (item_current_img == "systems/ptu/static/images/item_icons/generic item.webp"))
            {
                let new_image = await GetItemArt(item_name)
        
                console.log("preCreateItem: Default image detected, replacing with:");
                console.log(new_image);
        
                if(new_image != undefined)
                {
                    // ptu_item.img = new_image;
                    // ptu_item.data.img = new_image;
                    await ptu_item.update({"img": new_image});
                }
            }
        });
    }
}

export async function GetItemArt(item_name, type = ".webp") { 

    const imgDirectoryPath = "systems/ptu/static/images/item_icons/";
    const customImgDirectoryPath = game.settings.get("ptu", "customItemIconDirectory");

    const basePath = imgDirectoryPath+(imgDirectoryPath.endsWith('/') ? '' : '/');
    const customBasePath = customImgDirectoryPath+(customImgDirectoryPath.endsWith('/') ? '' : '/');

    let clean_item_name = item_name.replace("é", "e").replace(":", "").toLowerCase();
    if(clean_item_name.includes("tm"))
    {
        clean_item_name = "tm";
    }

    let path = customBasePath+clean_item_name+type;
    let result = await fetch(path);

    if(result.status === 404) {
        path = customBasePath+clean_item_name+".png";
        result = await fetch(path);
    }

    if(result.status === 404) {
        path = basePath+clean_item_name+type;
        result = await fetch(path);
    }

    if(result.status === 404) {
        path = basePath+clean_item_name+".png";
        result = await fetch(path);
    }

    if(result.status === 404) {
        return undefined;
    }
    return path;
} 