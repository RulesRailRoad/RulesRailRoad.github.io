// Define changes
const stateChangeUp = "change from bottom state to top state";
const stateChangeDown = "change from top state to bottom state";

const bondAddedNonRev = "nradded";
const bondRemovedNonRev = "nrbroken";
const bondAddedRev = "radded";
const bondRemovedRev = "rbroken";
const bindAndStateChange = "bind_and_state_change";

const NoChangeComplex = "NoChangeComplex";
const NoChangeSeparate = "NoChangeSeparate";
const NonRevChangeComplex = "NonRevChangeComplex";
const NonRevChangeSeparate = "NonRevChangeSeparate";
const RevChangeComplex = "RevChangeComplex";
const RevChangeSeparate = "RevChangeSeparate";

function getDuplicateSiteNameMap(sites) {
    const counts = {};
    const result = {};

    for (const s of sites) {
        const base = s.split('~')[0].split('!')[0];
        counts[base] = (counts[base] || 0) + 1;
    }

    for (const name in counts) {
        if (counts[name] > 1) {
            result[name] = true;  // this site is duplicated
        }
    }

    return result;  // e.g., { r: true }
}

 function extractGroupOrder(str) {
        const delimiters = [];
        for (let i=0; i<str.length; i++) {
            const char = str[i];
            if (char === '.') {
                delimiters.push(char);
            } else if (char === '+' && str[i+1] === " ") {
                delimiters.push(char);
            }
            
        } return delimiters;
    }

// function to compare + and . changes in reactions
function compareComplexSeparation(expandedReactants, expandedProducts, arrow) { 
    // extract delimiter order

    const changes = []
    const reactantOrder = extractGroupOrder(expandedReactants);
    const productOrder = extractGroupOrder(expandedProducts);

    if (reactantOrder.length !== productOrder.length) {
        //console.warn("Mismatched reaction order — skipping reaction comparison.");
        return;
    }

    for (let i = 0; i < reactantOrder.length; i++) {
        if (reactantOrder[i] === productOrder[i]) {
            if (reactantOrder[i] === "+") {
                changes.push(NoChangeSeparate);
            } else {
                changes.push(NoChangeComplex);
            }
        } else {
            if (reactantOrder[i] === "+") {
                if (arrow === "->") {
                    changes.push(NonRevChangeComplex);
                } else {
                    changes.push(RevChangeComplex);
                }
            } else {
                if (arrow === "->") {
                    changes.push(NonRevChangeSeparate);
                } else {
                    changes.push(RevChangeSeparate);
                }
            }
        }
    }
    return changes;
}



function compareReactions(expandedReactants, expandedProducts, arrow, molSiteDict) {
    // send to function to compare + . changes
    const complexChanges = compareComplexSeparation(expandedReactants, expandedProducts, arrow);

    const replaced_expandedReactants = expandedReactants.replace(/ \+ /g, '.');
    const replaced_expandedProducts = expandedProducts.replace(/ \+ /g, '.');
    const changesDict = {};
    let synth_deg_changesDict = {};
    const rmolCounter = {};
    const pmolCounter = {};

    const reactantParts = replaced_expandedReactants.split(".");
    const productParts = replaced_expandedProducts.split(".");

    // Check if the molecule order matches
    const reactantOrder = reactantParts.map(p => p.trim().split("(")[0]);
    const productOrder = productParts.map(p => p.trim().split("(")[0]);

    if (reactantOrder.join(",") !== productOrder.join(",")) {
        console.warn("Molecule order mismatch", "reactants:", reactantOrder, "products:", productOrder);

        const synthesized = productOrder.filter(p => !reactantOrder.includes(p));
        const degraded = reactantOrder.filter(p => !productOrder.includes(p));

        let fullReactionString;

        if ((degraded.length > 0 && synthesized.length === 0) || (synthesized.length > 0 && degraded.length === 0) 
            || (degraded.length > 0 && synthesized.length > 0)) {
            const seen = new Set();
            const uniqueParts = [];

            for (const part of [...reactantParts, ...productParts]) {
                const molName = part.trim().split("(")[0];
                if (!seen.has(molName)) {
                    seen.add(molName);
                    uniqueParts.push(part);
                }
            }
            fullReactionString = uniqueParts.join(".");

        } else {
            // No synthesis or degradation — compare molecule names
            const leftMolNames = reactantParts.map(p => p.trim().split("(")[0]).sort();
            const rightMolNames = productParts.map(p => p.trim().split("(")[0]).sort();

            const sameMolecules = (
                leftMolNames.length === rightMolNames.length &&
                leftMolNames.every((v, i) => v === rightMolNames[i])
            );

            const sameOrder = reactantParts.map(p => p.trim().split("(")[0])
                .every((mol, i) => mol === productParts[i]?.trim().split("(")[0]);

            if (sameMolecules && !sameOrder) {
                // Same molecules, different order — skip
                return { changes: null, complexChanges: null, synth_deg_changes: null };
            }
        }

        // normalize reaction parts
        const reactantMap = new Map(reactantParts.map(p => [p.split("(")[0].trim(), p]));
        const productMap  = new Map(productParts.map(p => [p.split("(")[0].trim(), p]));

        let allNames = [];
        if (!(degraded.length > 0 && synthesized.length > 0)) {
            productParts.forEach(p => {
                const name = p.split("(")[0].trim();
                if (!allNames.includes(name)) allNames.push(name);
            });
            reactantParts.forEach(p => {
                const name = p.split("(")[0].trim();
                if (!allNames.includes(name)) allNames.push(name);
            });
        } else {
            allNames = [...new Set([...reactantParts, ...productParts].map(p => p.split("(")[0].trim()))];
        }

        const normalizedReactants = [];
        const normalizedProducts = [];

        for (const name of allNames) {
            const r = reactantMap.get(name);
            const p = productMap.get(name);

            if (r && p) {
                normalizedReactants.push(r);
                normalizedProducts.push(p);
            } else if (r) { // degraded
                normalizedReactants.push(r);
                normalizedProducts.push(r); 
            } else if (p) { // synthesized
                normalizedReactants.push(p); 
                normalizedProducts.push(p);
            }
        }

        fullReactionString = normalizedReactants.join(".")  // both sides now the same
        const fullProductString = normalizedProducts.join(".")

        const originalReactants = expandedReactants.trim();
        const originalProducts = expandedProducts.trim();

        // Insert synthesized molecules into the original reactants using '+'
        const synthGroups = synthesized.map(name => {
            return productMap.get(name) || name;
        });
        const augmentedReactants = originalReactants + (synthGroups.length > 0 ? " + " + synthGroups.join(" + ") : "");

        // Insert degraded molecules into the original products using '+'
        const degrGroups = degraded.map(name => {
            return reactantMap.get(name) || name;
        });
        const augmentedProducts = originalProducts + (degrGroups.length > 0 ? " + " + degrGroups.join(" + ") : "");

        const complexChanges = compareComplexSeparation(augmentedReactants, augmentedProducts, arrow);

        if (
            synthesized.length > 0 &&
            degraded.length === 0 &&
            productOrder.length > 1 &&
            synthesized.includes(productOrder[0])
        ) {
            const seen = new Set();
            const allNames = [];

            // Preserve product order first
            for (const name of productOrder) {
                if (!seen.has(name)) {
                    seen.add(name);
                    allNames.push(name);
                }
            }
            for (const name of reactantOrder) {
                if (!seen.has(name)) {
                    seen.add(name);
                    allNames.push(name);
                }
            }

            const reactantDelimiters = extractGroupOrder(expandedReactants);
            const productDelimiters = extractGroupOrder(expandedProducts);


            const finalReactants = [];
            const finalProducts = [];
            const finalReactantDelimiters = [];
            const finalProductDelimiters = [];

            for (const name of allNames) {
                const r = reactantMap.get(name);
                const p = productMap.get(name);

                if (r && p) {
                    finalReactants.push(r);
                    finalProducts.push(p);

                    // Get original delimiters by finding index in original molecule order
                    const rIndex = reactantOrder.indexOf(name);
                    const pIndex = productOrder.indexOf(name);

                    finalReactantDelimiters.push(reactantDelimiters[rIndex] || '+');
                    finalProductDelimiters.push(productDelimiters[pIndex] || '+');
                } else if (r) { // degraded
                    finalReactants.push(r);
                    finalProducts.push(r);
                    finalReactantDelimiters.push('+');
                    finalProductDelimiters.push('+');
                } else if (p) { // synthesized
                    finalReactants.push(p);
                    finalProducts.push(p);
                    finalReactantDelimiters.push('+');
                    finalProductDelimiters.push('+');
                }
            }

            function interleave(parts, delimiters) {
                const result = [parts[0]];
                for (let i = 1; i < parts.length; i++) {
                    result.push(` ${delimiters[i - 1]} `);
                    result.push(parts[i]);
                }
                return result.join('');
            }

            const insertedReactionString = interleave(finalReactants, finalReactantDelimiters);
            const insertedProductString = interleave(finalProducts, finalProductDelimiters);

            const complexChanges = compareComplexSeparation(insertedReactionString, insertedProductString, arrow);



            synth_deg_changesDict = {
                reactants: reactantOrder,
                products: productOrder,
                synthesized: synthesized,
                degraded: degraded,
                fullReactionString: insertedReactionString.replace(" + ", ".")
            };

            return {
                changes: null,
                complexChanges,
                synth_deg_changes: synth_deg_changesDict
            };
        }

        synth_deg_changesDict = {
                reactants: reactantOrder,
                products: productOrder,
                synthesized: synthesized,
                degraded: degraded,
                fullReactionString: fullReactionString
        }

        return { changes: null, complexChanges: complexChanges, synth_deg_changes: synth_deg_changesDict }; // return + . changes
    }


    const allRsites = [];
    for (const part of reactantParts) {
        const rmol = part.split("(")[0];
        const rsites = part.split("(")[1].slice(0, -1);  // remove trailing ")"
        const rsitesParts = rsites.split(",");

        rmolCounter[rmol] = (rmolCounter[rmol] || 0) + 1;
        const molLabel = `${rmol} #${rmolCounter[rmol]}`;

        const rTracker = {};
        for (const site of rsitesParts) {
            const base = site.split('~')[0].split('!')[0];
            const index = rTracker[`${molLabel}:${base}`] = (rTracker[`${molLabel}:${base}`] || 0);
            rTracker[`${molLabel}:${base}`]++;
            allRsites.push([molLabel, site, base, index]);
        }

    }

    const allPsites = [];
    for (const part of productParts) {
        const pmol = part.split("(")[0];
        const psites = part.split("(")[1].slice(0, -1);
        const psitesParts = psites.split(",");

        pmolCounter[pmol] = (pmolCounter[pmol] || 0) + 1;
        const molLabel = `${pmol} #${pmolCounter[pmol]}`;

        const pTracker = {};
        for (const site of psitesParts) {
            const base = site.split('~')[0].split('!')[0];
            const index = pTracker[`${molLabel}:${base}`] = (pTracker[`${molLabel}:${base}`] || 0);
            pTracker[`${molLabel}:${base}`]++;
            allPsites.push([molLabel, site, base, index]);
        }

    }

    // Determine which molecules have repeated site names
    const duplicateSiteTrackers = {};
    for (const mol of Object.keys(molSiteDict)) {
        duplicateSiteTrackers[mol] = getDuplicateSiteNameMap(molSiteDict[mol] || []);
    }

    if (!allRsites || !allPsites || allRsites.length !== allPsites.length) {
    console.error("Skipping reaction comparison due to mismatched reactants and products.", 
                  "Reactants:", allRsites, "Products:", allPsites);
    return { changes: null, complexChanges: null }; // return + . changes
}
    for (let i = 0; i < allRsites.length; i++) {
        const [rmol, rRaw, rsite, rIndex] = allRsites[i];
        const [pmol, pRaw, psite, pIndex] = allPsites[i];

        if (rRaw !== pRaw) {
            let rstate = null, pstate = null;
            let rsite = null, psite = null;
            let rbond = null, pbond = null;

            if (rRaw.includes("~")) {
                rstate = "~" + rRaw.split("~").slice(-1)[0];
                rsite = rRaw.split("~")[0];
                if (rstate.includes("!")) {
                    [rstate, rbond] = rstate.split("!");
                    rbond = "!" + rbond;
                }
            } else {
                [rsite, rbond] = rRaw.split("!");
                rbond = "!" + rbond;
            }

            if (pRaw.includes("~")) {
                pstate = "~" + pRaw.split("~").slice(-1)[0];
                psite = pRaw.split("~")[0];
                if (pstate.includes("!")) {
                    [pstate, pbond] = pstate.split("!");
                    pbond = "!" + pbond;
                }
            } else {
                [psite, pbond] = pRaw.split("!");
                pbond = "!" + pbond;
            }

            const change = [];

            if (rstate !== pstate) {
                const rmolBase = rmol.split(" #")[0];
                const moleSites = molSiteDict[rmolBase] || [];
                for (const site of moleSites) {
                    if (site.startsWith(rsite + "~")) {
                        const stateList = site.split("~").slice(1);
                        const rIndex = stateList.indexOf(rstate?.slice(1));
                        const pIndex = stateList.indexOf(pstate?.slice(1));
                        if (rIndex < pIndex) {
                            change.push(stateChangeDown);
                        } else if (rIndex > pIndex) {
                            change.push(stateChangeUp);
                        }
                    }
                }
            }

            if (rbond !== pbond) {
                if (arrow === "->") {
                    change.push(rbond === "!-" ? bondAddedNonRev : bondRemovedNonRev);
                } else {
                    change.push(rbond === "!-" ? bondAddedRev : bondRemovedRev);
                }
            }

            if (
                rstate !== pstate &&
                rsite === psite &&
                (
                    rbond !== pbond ||           // bond change
                    (rbond === pbond && rbond !== "!-") // or bond same but not broken
                )
            ) {
                change.push(bindAndStateChange);
            }

            const molBase = rmol.split(" #")[0];
            const siteKey = duplicateSiteTrackers[molBase]?.[rsite]
                ? `${rmol}:${rsite}[${rIndex}]`
                : `${rmol}:${rsite}`;

            changesDict[siteKey] = {
                molecule: rmol,
                site: rsite,
                reactant: rRaw,
                product: pRaw,
                change: change,
            };
        }
    }
    return {
        changes: changesDict,
        complexChanges: complexChanges // return + . changes
    };
}

export {
    compareReactions,
    stateChangeUp,
    stateChangeDown,
    bondAddedNonRev,
    bondRemovedNonRev,
    bondAddedRev,
    bondRemovedRev,
    bindAndStateChange,
    NoChangeComplex,
    NoChangeSeparate,
    NonRevChangeComplex,
    NonRevChangeSeparate,
    RevChangeComplex,
    RevChangeSeparate
};