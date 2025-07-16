// Molecules_BNGL_to_Python.js

export function bnglToRailroad(bnglString, displayString = null, changesDict = null, molSiteDict = {}, showBNGLString, showMolecules, showBondIndices, arrow = null, complexChanges = null, synth_deg_changes = null) {
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

    const NoChangeComplex = "NoChangeComplex";
    const NoChangeSeparate = "NoChangeSeparate";
    const NonRevChangeComplex = "NonRevChangeComplex";
    const NonRevChangeSeparate = "NonRevChangeSeparate";
    const RevChangeComplex = "RevChangeComplex";
    const RevChangeSeparate = "RevChangeSeparate";

    let molChunks = bnglString.split('.');

    const synthesized = synth_deg_changes?.synthesized || [];
    const dup_synthesized = synth_deg_changes?.dup_synthesized || [];    
    const degraded = synth_deg_changes?.degraded || [];
    const dup_degraded = synth_deg_changes?.dup_degraded || [];

    const pureSynthesized = synth_deg_changes?.pure_synthesized || [];
    const pureDegraded = synth_deg_changes?.pure_degraded || [];

    const isPureSynthesis = pureSynthesized.length > 0;
    const isPureDegradation = pureDegraded.length > 0;

    const label = showBNGLString ? (displayString || bnglString).trim() : " ";
    const diagrams = [
        `add("${label}",`,
        "    new Diagram("
    ];

    const moleculeCounter = {};

    molChunks.forEach((chunk, idx) => {
        const molSequence = [];
        const molMatch = chunk.trim().match(/(\w+)\((.*)\)/);
        if (!molMatch) {
            console.warn("BNGL string format is invalid:", chunk);
            return;
        }

        const [_, moleculeName, siteBlock] = molMatch;
        moleculeCounter[moleculeName] = (moleculeCounter[moleculeName] || 0) + 1;
        const moleculeInstance = `${moleculeName} #${moleculeCounter[moleculeName]}`;

        const isSynthesized = dup_synthesized?.some(s => s.name === moleculeName && s.index === idx) ||
                      pureSynthesized.some(s => s.full === chunk);

        const isDegraded = dup_degraded?.some(s => s.name === moleculeName && s.index === idx) ||
                   pureDegraded.some(s => s.full === chunk);   
        
        if (siteBlock === "") {
            let molCode = `new Terminal("${moleculeName}", { box_color: "${MoleculeColor}" })`;

            if (isDegraded) {
                molCode = `new Group(${molCode}, "degraded")`;
            }
            if (degraded.includes(moleculeName)) {
                molCode = `new Group(${molCode}, "degraded")`;
            }
            if (isSynthesized) {
                molCode = `new Group(${molCode}, "synthesized")`;
            }
            if (synthesized.includes(moleculeName)) {
                molCode = `new Group(${molCode}, "synthesized")`;
            }

            diagrams.push(`        ${molCode},`);

            if (idx < molChunks.length - 1) {
            if (complexChanges) {
                const complexChange = complexChanges[idx];
                diagrams.push(`        new EndWhiteSpace('${complexChange}'),`);
            } else {
                diagrams.push("        new EndWhiteSpace(),");
            }
        }
            return;
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
            let showBond = false;
            let siteName = site;
            let states = [];

            showBondIndices ? (showBond = true) : (showBond = false);


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
                    let showBond = false;
                    let stateName = state;
                    const changes = changesDict[siteKey];

                    showBondIndices ? (showBond = true) : (showBond = false);

                    if (state.includes("!")) {
                        const splitState = state.split("!");
                        stateName = splitState[0];
                        bondNum = splitState[1];

                        if (bondNum === "?") {
                            bondArg = ', bottom_bind: true, bottom_bind_color: \"gray\"';
                            bondNumArg = `, bond_num: \"${bondNum}\"`;
                        } else if (bondNum === "+" || /\d+/.test(bondNum)) {
                            bondArg = ', bottom_bind: true';
                            bondNumArg = `, bond_num: \"${bondNum}\"`;
                            if (showBondIndices && /^\d+$/.test(bondNum)) {
                                bondNumArg += `, show_bond: true`;
                            }
                        }
                        
                            if (changes && changes.change.some(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c))) {
                                const bondChange = changes.change.find(c => [bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev].includes(c));
                                bondTypeArg = `, bond_type: \"${bondChange}\"`;
                                if (bondNum === "-") {
                                    const numArg = changes.product.split("!")[1];
                                    bondArg = ', bottom_bind: true';
                                    bondNumArg = `, bond_num: \"${numArg}\"`;
                                    if (showBondIndices && /^\d+$/.test(numArg)) {
                                        bondNumArg += `, show_bond: true`;
                                    }
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

                        finStates.push(`new MultipleChoice(0, \"${direction}\", \"${arrow}\", ${allStates.join(", ")})`);

                        } else {
                            finStates.push(`new NonTerminal(\"${state}\", { box_color: \"${StateColor}\"${bondArg}${bondNumArg}${bondTypeArg} })`);
                        }
                    
                });
                
                const stateChoices = finStates.join(",\n        ");
                const siteCode = `        new Sequence(new Choice(0,\n            new Terminal(\"${siteName}\", { box_color: \"${SiteColor}\" }),\n                ${stateChoices}\n                   )),`;
                molSequence.push(siteCode);
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
                        if (showBondIndices && /^\d+$/.test(bondNum)) {
                                bondNumArg += `, show_bond: true`;
                            }
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
                            if (showBondIndices && /^\d+$/.test(numArg)) {
                                bondNumArg += `, show_bond: true`;
                            }
                        }
                    }
                }

                const siteCode = `    new Sequence(new Terminal(\"${siteName}\", { box_color: \"${SiteColor}\"${bondArg}${bondNumArg}${bondTypeArg} })),`;
                molSequence.push(siteCode);
            }
        });

        let fullMolecule = `new Sequence(\n${molSequence.join("\n")}\n    )`;

        if (showMolecules) {
            const molLabel = `new Terminal("${moleculeName}", { box_color: "${MoleculeColor}" })`;
            molSequence.unshift(molLabel + ",");
            fullMolecule = `new Sequence(\n${molSequence.join("\n")}\n    )`;
        }
        if (degraded.includes(moleculeName)) {
            fullMolecule = `new Group(${fullMolecule}, "degraded" )`;
        }
        if (isDegraded) {
            fullMolecule = `new Group(${fullMolecule}, "degraded" )`;
        }
        if (synthesized.includes(moleculeName)) {
            fullMolecule = `new Group(${fullMolecule}, "synthesized")`;
        }
        if (isSynthesized) {
            fullMolecule = `new Group(${fullMolecule}, "synthesized")`;
        }

        diagrams.push(`        ${fullMolecule},`);

        if (idx < molChunks.length - 1) {
            if (complexChanges) {
                // adds separator between molecules
                const complexChange = complexChanges[idx]
                diagrams.push(`        new EndWhiteSpace(\'${complexChange}\'),`);
            } else {
                diagrams.push("        new EndWhiteSpace(),");
            }
        }
        });
        
    diagrams.push("    )\n)");

    return diagrams.join("\n") + "\n";
}
