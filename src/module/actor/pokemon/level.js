function calculateLevel(exp, level = 50) {
    const json = CONFIG.PTU.data.levelProgression;
    const maxLevel = Math.max(...Object.keys(json));

    if (exp <= json[1]) { return 1; }
    if (exp >= json[maxLevel]) { return maxLevel; }

    return _recursiveLevelCalc(exp, level, json);
}

function _recursiveLevelCalc(exp, level, json) {
    if (exp > json[level]) {
        return _recursiveLevelCalc(exp, ++level, json)
    }
    else {
        if (json[level] >= exp) {
            if (json[level - 1] >= exp) {
                if (json[Math.max(Math.floor(level / 2), 1)]) {
                    return _recursiveLevelCalc(exp, Math.max(Math.floor(level / 2), 1), json);
                }
                else {
                    return _recursiveLevelCalc(exp, level - 2, json);
                }
            }
        }
    }

    return exp == json[level] ? level : level - 1;
}
export { calculateLevel }

globalThis.calculateLevel = calculateLevel;