

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

