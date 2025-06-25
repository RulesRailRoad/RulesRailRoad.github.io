// Molecules_BNGL_to_Python.js

export function bnglToRailroad(bnglString, displayString = null, changesDict = null, molSiteDict = {}, showBNGLString) {
    if (!changesDict) changesDict = {};
    const MoleculeColor = 'lightgreen';
    const SiteColor = 'lightblue';
    const StateColor = 'khaki';

    const bondAddedNonRev = "nradded";
    const bondRemovedNonRev = "nrbroken";
    const bondAddedRev = "radded";
    const bondRemovedRev = "rbroken";
    const stateChangeUp = "change from bottom state to top state";
    const stateChangeDown = "change from top state to bottom state";
    const bindAndStateChange = "bind_and_state_change";

    const molChunks = bnglString.split('.');
    const label = showBNGLString ? (displayString || bnglString).trim() : " ";
    const diagrams = [
        `add("${label}",`,
        "    new Diagram("
    ];

    const moleculeCounter = {};

    molChunks.forEach((chunk, idx) => {
        const molMatch = chunk.trim().match(/(\w+)\((.*)\)/);
        if (!molMatch) {
            console.warn("BNGL string format is invalid:", chunk);
            return;
        }

        const [_, moleculeName, siteBlock] = molMatch;
        moleculeCounter[moleculeName] = (moleculeCounter[moleculeName] || 0) + 1;
        const moleculeInstance = `${moleculeName} #${moleculeCounter[moleculeName]}`;

        diagrams.push(`        new Terminal(\"${moleculeName}\", { box_color: \"${MoleculeColor}\" }),`);
        if (siteBlock === "") {
            return; // skip site processing
        }

        const sites = siteBlock.split(',').map(s => s.trim()).filter(s => s);

        // Build per-molecule-instance map of site name counts
        const siteNameCounts = {};
        sites.forEach(s => {
            const base = s.split('~')[0].split('!')[0].trim();
            siteNameCounts[base] = (siteNameCounts[base] || 0) + 1;
        });

        // Initialize tracking of which instance (index) we're on for each site
        const siteNameIndex = {};

        sites.forEach(site => {
            let bondArg = "";
            let bondNumArg = "";
            let bondTypeArg = "";
            let bondNum = null;
            let siteName = site;
            let states = [];

            if (site.includes('~')) {
                const parts = site.split('~');
                siteName = parts[0];
                
                let index = siteNameIndex[siteName] || 0;
                const indexedKey = `${moleculeInstance}:${siteName}[${index}]`;
                const unindexedKey = `${moleculeInstance}:${siteName}`;
                const siteKey = (changesDict && changesDict[indexedKey]) ? indexedKey : unindexedKey;
                siteNameIndex[siteName] = index + 1;

                states = parts.slice(1);
                const finStates = [];

                states.forEach((state, stateIdx) => {
                    bondArg = "";
                    bondNumArg = "";
                    bondTypeArg = "";
                    let stateName = state;
                    const changes = changesDict[siteKey];

                    if (state.includes("!")) {
                        const splitState = state.split("!");
                        stateName = splitState[0];
                        bondNum = splitState[1];

                        if (states.length > 1 && stateIdx === states.length - 1 && bondNum === "?") {
                            states[states.length - 1] = stateName;
                            finStates.push(`new NonTerminal(\"${stateName}\", { box_color: \"${StateColor}\", bottom_bind: true, wrap: true })`);
                            return;
                        }

                        if (bondNum === "?") {
                            bondArg = ', bottom_bind: true, bottom_bind_color: \"gray\"';
                            bondNumArg = `, bond_num: \"${bondNum}\"`;
                        } else if (bondNum === "+" || /\d+/.test(bondNum)) {
                            bondArg = ', bottom_bind: true';
                            bondNumArg = `, bond_num: \"${bondNum}\"`;
                        }

                        
                            if (changes && changes.change.some(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c))) {
                                const bondChange = changes.change.find(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c));
                                bondTypeArg = `, bond_type: \"${bondChange}\"`;
                                if (bondNum === "-") {
                                    const numArg = changes.product.split("!")[1];
                                    bondArg = ', bottom_bind: true';
                                    bondNumArg = `, bond_num: \"${numArg}\"`;
                                }
                            }
                        
                        state = stateName;
                    }
                        if (changes && (changes.change.includes(stateChangeUp) || changes.change.includes(stateChangeDown))) {
                            const direction = changes.change.includes(stateChangeDown) ? "down-arrow" : "up-arrow";
                            const reactantState = changes.reactant.split("~").slice(-1)[0].split("!")[0];
                            const productState = changes.product.split("~").slice(-1)[0].split("!")[0];
                            const siteDefs = molSiteDict[moleculeName] || [];

                            let stateList = [];
                            for (const def of siteDefs) {
                                if (def.startsWith(siteName + "~")) {
                                    stateList = def.split("~").slice(1).map(s => s.split("!")[0]);
                                    break;
                                }
                            }
                            const ordered = stateList.filter(s => [reactantState, productState].includes(s));
                            let extraLayoutArg = "";
                            if (changes && changes.change.includes(bindAndStateChange)) {
                                const isDown = changes.change.includes(stateChangeDown);
                                const topState = isDown ? reactantState : productState;
                                if (state == topState) {
                                extraLayoutArg = ", state_and_bond_wrap: true";
                                }
                            }
                            const allStates = ordered.map(s => {
                                const match = s === state ? `${bondArg}${bondNumArg}${bondTypeArg}` : "";
                                return `new NonTerminal(\"${s}\", { box_color: \"${StateColor}\"${match}${extraLayoutArg} })`;
                            });
                            finStates.push(`new MultipleChoice(0, \"${direction}\", ${allStates.join(", ")})`);
                        } else {
                            finStates.push(`new NonTerminal(\"${state}\", { box_color: \"${StateColor}\"${bondArg}${bondNumArg}${bondTypeArg} })`);
                        }
                    
                });

                const stateChoices = finStates.join(", ");
                const siteCode = `    new Choice(0, new Comment(\"    \"), new Sequence(new Terminal(\"${siteName}\", { box_color: \"${SiteColor}\" }), new Choice(0, new Comment(\"    \"), ${stateChoices}))),`;
                diagrams.push(siteCode);
            } else {
                if (siteName.includes("!")) {
                    const [name, bond] = siteName.split("!");
                    siteName = name;
                    bondNum = bond;
                    if (bondNum === "?") {
                        bondArg = ', bottom_bind: true, bottom_bind_color: \"gray\"';
                        bondNumArg = `, bond_num: \"${bondNum}\"`;
                    } else if (bondNum === "+" || /\d+/.test(bondNum)) {
                        bondArg = ', bottom_bind: true';
                        bondNumArg = `, bond_num: \"${bondNum}\"`;
                    }
                }

                if (changesDict) {
                    let siteKey = `${moleculeInstance}:${siteName}`;
                    if (siteNameCounts[siteName] > 1) {
                        const index = siteNameIndex[siteName] || 0;
                        siteKey = `${siteKey}[${index}]`;
                        siteNameIndex[siteName] = index + 1;
                    }
                    const changes = changesDict[siteKey];
                    if (changes && changes.change.some(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c))) {
                        const bondChange = changes.change.find(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c));
                        bondTypeArg = `, bond_type: \"${bondChange}\"`;
                        if (bondNum === "-") {
                            const numArg = changes.product.split("!")[1];
                            bondArg = ', bottom_bind: true';
                            bondNumArg = `, bond_num: \"${numArg}\"`;
                        }
                    }
                }

                const siteCode = `    new Choice(0, new Comment(\"    \"), new Terminal(\"${siteName}\", { box_color: \"${SiteColor}\"${bondArg}${bondNumArg}${bondTypeArg} })),`;
                diagrams.push(siteCode);
            }
        });

        if (idx < molChunks.length - 1) {
            diagrams.push("        new EndWhiteSpace(),");
        }
    });

    diagrams.push("    )\n)");

    return diagrams.join("\n") + "\n";
}