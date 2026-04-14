
/**
 * Get all the referenced documents from the given data.
 * @param {*} data 
 * @returns 
 */
export function getReferencedDocuments(data) {
  const referenced = new Set();
  if (data?.system?.referenceEffect) referenced.add(data.system.referenceEffect);
  for (const rule of data?.system?.rules ?? []) {
    switch (rule?.key) {
      case "ApplyEffect":
      case "GrantItem":
      case "TemporarySpecies":
        // check if the rule is using a choice set or not
        if (!rule.uuid || rule.uuid?.startsWith("{")) continue;
        referenced.add(rule.uuid);
        break;
      case "ChoiceSet":
        for (const option of rule.choices ?? []) {
          if (option.value?.startsWith("Compendium.")) referenced.add(option.value);
          if (option.value?.startsWith("Item.")) referenced.add(option.value);
        }
    }
  }
  return Array.from(referenced);
};

const ForgeRE = /^https:\/\/assets\.forge-vtt\.com\/.*\/systems\/ptu\//i;

/**
 * Apply any system-specific transformations to the merged document data before staging. Used to fix minor data issues that are not worth a full diff, such
 * as stripping ForgeVTT/Sqyre image URLs or normalising paths.
 * @param {*} data 
 */
export function transform(data) {
  if (ForgeRE.test(data.img)) {
    data.img = data.img.replace(ForgeRE, "/systems/ptu/");
  }
  return data;
}

