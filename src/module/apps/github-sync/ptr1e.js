
/**
 * Get all the referenced documents from the given data.
 * @param {*} data 
 * @returns 
 */
export function getReferencedDocuments(data) {
  const referenced = new Set();
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

/**
 * Apply any system-specific transformations to the merged document data before staging. Used to fix minor data issues that are not worth a full diff, such
 * as stripping ForgeVTT/Sqyre image URLs or normalising paths.
 * @param {*} data 
 */
export function transform(data) {
  if (data.img.matches(/https:\/\/assets\.forge-vtt\.com\/.*\/systems\/ptu\//)) {
    data.img = data.img.replace(/https:\/\/assets\.forge-vtt\.com\/.*\/systems\/ptu\//, "/systems/ptu/");
  }
  return data;
}

