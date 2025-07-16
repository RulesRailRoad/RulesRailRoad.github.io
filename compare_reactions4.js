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

function compareDelimiterLists(list1, list2, arrow) {
    const changes = [];
    for (let i = 0; i < list1.length; i++) {
        if (list1[i] === list2[i]) {
            if (list1[i] === "+") {
                changes.push(NoChangeSeparate);
            } else {
                changes.push(NoChangeComplex);
            }
        } else {
            if (list1[i] === "+") {
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

// function to compare + and . changes in reactions
function compareComplexSeparation(expandedReactants, expandedProducts, arrow) { 
    // extract delimiter order

    let changes = []
    const reactantOrder = extractGroupOrder(expandedReactants);
    const productOrder = extractGroupOrder(expandedProducts);

    if (reactantOrder.length !== productOrder.length) {
        return;
    }

    changes = compareDelimiterLists(reactantOrder, productOrder, arrow);
    return changes;
}



function compareReactions(expandedReactants, expandedProducts, arrow, molSiteDict) {
    // Determine which molecules have repeated site names
    const duplicateSiteTrackers = {};
    for (const mol of Object.keys(molSiteDict)) {
        duplicateSiteTrackers[mol] = getDuplicateSiteNameMap(molSiteDict[mol] || []);
    }


    const output = [];
    // send to function to compare + . changes
    const complexChanges = compareComplexSeparation(expandedReactants, expandedProducts, arrow);
    let complex_changes = [];

    const replaced_expandedReactants = expandedReactants.replace(/ \+ /g, '.');
    const replaced_expandedProducts = expandedProducts.replace(/ \+ /g, '.');
    let changesDict = {};
    let synth_deg_changesDict = {};
    let rmolCounter = {};
    const pmolCounter = {};

    let reactantParts = replaced_expandedReactants.split(".");
    let productParts = replaced_expandedProducts.split(".");

    if (expandedReactants.trim() === "0" || expandedProducts.trim() === "0") {

        if (expandedReactants.trim() === "0") {
            // Pure synthesis: all productParts are synthesized
            const pure_synthesized = productParts.map((part, index) => ({
                name: part.split("(")[0].trim(),
                full: part,
                index: index
            }));

            synth_deg_changesDict.pure_synthesized = pure_synthesized;
            synth_deg_changesDict.pure_degraded = [];
            synth_deg_changesDict.fullReactionString = productParts.join(".");

            const original_delimiters = extractGroupOrder(expandedProducts);
            const new_delimiters = extractGroupOrder(productParts.join(" + "));
            complex_changes = compareDelimiterLists(original_delimiters, new_delimiters, arrow);

            return {
                changes: null,
                complexChanges: complex_changes,
                synth_deg_changes: synth_deg_changesDict,
                outputErrors: null
            };

        }

        if (expandedProducts.trim() === "0") {
            // Pure degradation: all reactantParts are degraded
            const pure_degraded = reactantParts.map((part, index) => ({
                name: part.split("(")[0].trim(),
                full: part,
                index: index
            }));

            synth_deg_changesDict.pure_synthesized = [];
            synth_deg_changesDict.pure_degraded = pure_degraded;
            synth_deg_changesDict.fullReactionString = reactantParts.join(".");
        
            const original_delimiters = extractGroupOrder(expandedReactants);
            const new_ = reactantParts.join(" + ");
            const new_delimiters = extractGroupOrder(new_);
            complex_changes = compareDelimiterLists(original_delimiters, new_delimiters, arrow);

            const reactantSiteTracker = {};
            for (const part of reactantParts) {
                const molName = part.split("(")[0].trim();
                const siteBlock = part.match(/\((.*?)\)/)?.[1];

                if (!siteBlock) continue;
                const sites = siteBlock.split(",");
                rmolCounter[molName] = (rmolCounter[molName] || 0) + 1;
                const molLabel = `${molName} #${rmolCounter[molName]}`;

                if (!reactantSiteTracker[molLabel]) {
                    reactantSiteTracker[molLabel] = {};
                }

                for (const site of sites) {
                    const bondMatch = site.match(/!(\d+)/);
                    if (bondMatch) {
                        const siteName = site.split("~")[0].split("!")[0];
                        const index = reactantSiteTracker[molLabel][siteName] || 0;
                        const siteKey = duplicateSiteTrackers[molName]?.[siteName]
                            ? `${molLabel}:${siteName}[${index}]`
                            : `${molLabel}:${siteName}`;

                        changesDict[siteKey] = {
                            molecule: molLabel,
                            site: siteName,
                            reactant: site,
                            product: site.split("!")[0] + "!-",
                            change: [bondRemovedNonRev],
                        };
                    }
                }
            }

            return {
                changes: changesDict,
                complexChanges: complex_changes,
                synth_deg_changes: synth_deg_changesDict,
                outputErrors: null
            };
        }
    }

    changesDict = {};
    // Check if the molecule order matches
    const reactantOrder = reactantParts.map(p => p.trim().split("(")[0]);
    const productOrder = productParts.map(p => p.trim().split("(")[0]);

    if (reactantOrder.join(",") !== productOrder.join(",")) {
        const synthesized = productOrder.filter(p => !reactantOrder.includes(p));
        const degraded = reactantOrder.filter(p => !productOrder.includes(p));

        let fullReactionString;

        if (!((degraded.length > 0 && synthesized.length === 0) || (synthesized.length > 0 && degraded.length === 0) 
            || (degraded.length > 0 && synthesized.length > 0))) {
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
                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                output.push(
                'document.getElementById("diagramArea").appendChild(' +
                `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(
                    "⚠️ Molecule order mismatch - skipping reaction: reactants: " + reactantOrder.join(", ") + " products: " + productOrder.join(", ")
                )} })` +
                ');'
                );
                return { changes: null, complexChanges: null, synth_deg_changes: null, outputErrors: output};
            }
        }

        const reactantNameCounts = {};
        for (const r of reactantParts) {
            const name = r.split("(")[0].trim();
            reactantNameCounts[name] = (reactantNameCounts[name] || 0) + 1;
        }

        const productNameCounts = {};
        for (const p of productParts) {
            const name = p.split("(")[0].trim();
            productNameCounts[name] = (productNameCounts[name] || 0) + 1;
        }

        // Only run neighbor context check if any molecule has duplicates on both sides
        const hasDuplicateOnBothSides = Object.keys(reactantNameCounts).some(name =>
            (reactantNameCounts[name] > 1 && productNameCounts[name] === 1) ||
            (productNameCounts[name] > 1 && reactantNameCounts[name] === 1)
        );

        let dup_synthesized = [];
        let dup_degraded = [];
        if (hasDuplicateOnBothSides) {
            const matched = new Array(productParts.length).fill(false);
            const reverseMatched = new Array(reactantParts.length).fill(false);

            // Step 1: Try to match reactants in order to products
            let rIdx = 0;
            for (let pIdx = 0; pIdx < productParts.length && rIdx < reactantParts.length; pIdx++) {
                if (productParts[pIdx] === reactantParts[rIdx]) {
                    matched[pIdx] = true;
                    reverseMatched[rIdx] = true;
                    rIdx++;
                }
            }

            // Step 2: Any unmatched product molecule is a synthesis candidate
            if (productParts.length > reactantParts.length) {
                for (let i = 0; i < productParts.length; i++) {
                    if (!matched[i]) {
                        const pname = productParts[i].split("(")[0].trim();
                        // Optional: look at productParts[i-1] or [i+1] to context-check
                        dup_synthesized.push({ name: pname, full: productParts[i] });
                    }
                }
            }

            if (reactantParts.length > productParts.length) {
                for (let i = 0; i < reactantParts.length; i++) {
                    if (!reverseMatched[i]) {
                        const pname = reactantParts[i].split("(")[0].trim();
                        dup_degraded.push({ name: pname, full: reactantParts[i], index: i });
                    }
                }
            }
        }
        // normalize reaction parts
        const reactantMap = new Map(reactantParts.map(p => [p.split("(")[0].trim(), p]));
        const productMap  = new Map(productParts.map(p => [p.split("(")[0].trim(), p]));

        let allNames = [];
        if ((!(degraded.length > 0 && synthesized.length > 0)) || (!(degraded.length > 0 && dup_synthesized.length > 0))) {
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
        const reactantDelimiters = [];
        const productDelimiters = [];

        const originalReactantDelimiters = extractGroupOrder(expandedReactants);
        const originalProductDelimiters = extractGroupOrder(expandedProducts);

        const reactantDelimMap = {};
        const productDelimMap = {};
        const molCounter = {};
        for (let i = 0; i < reactantParts.length - 1; i++) {
            const name = reactantParts[i].split("(")[0].trim();
            reactantDelimMap[name] = originalReactantDelimiters[i];
        }
        for (let i = 0; i < productParts.length - 1; i++) {
            const name = productParts[i].split("(")[0].trim();
            productDelimMap[name] = originalProductDelimiters[i];
            molCounter[name] = (molCounter[name] || 0) + 1;
        }


        if ((synthesized.length > 0 && degraded.length === 0)||(dup_synthesized.length > 0 && degraded.length === 0)) {
            // Use productParts as reference
            let rIdx = 0;
            for (let i = 0; i < productParts.length; i++) {
                const product = productParts[i];
                const name = product.split("(")[0].trim();
                const r = reactantMap.get(name);

                normalizedProducts.push(product);
                const isSynth = synthesized.concat(dup_synthesized).some(s => s.full === product);
                if (r && !isSynth) {
                    normalizedReactants.push(r);
                    reactantDelimiters.push(reactantDelimMap[name] ?? "+");
                } else {
                    normalizedReactants.push(product); // synthesized
                    reactantDelimiters.push(reactantDelimMap[name] ?? "+");
                }

                productDelimiters.push(originalProductDelimiters[i] ?? "+");
            }

            for (const reactant of reactantParts) {
                const name = reactant.split("(")[0].trim();
                if (!productMap.has(name)) {
                    normalizedReactants.push(reactant);  // degraded
                    normalizedProducts.push(reactant);
                    reactantDelimiters.push(reactantDelimMap[name] ?? "+");
                    productDelimiters.push(productDelimMap[name] ?? "+");
                }
            }

        } else {
            // Use reactantParts as reference
            let pIdx = 0;
            for (let i = 0; i < reactantParts.length; i++) {
                const reactant = reactantParts[i];
                const name = reactant.split("(")[0].trim();
                const p = productMap.get(name);

                const isDeg = degraded.concat(dup_degraded || []).some(d => d.full === reactant);
                normalizedReactants.push(reactant);
                reactantDelimiters.push(reactantDelimMap[name] ?? "+");

                if (p && !isDeg) {
                    normalizedProducts.push(p);
                } else {
                    normalizedProducts.push(reactant); // degraded
                }
                productDelimiters.push(productDelimMap[name] ?? "+");
            }

            for (const product of productParts) {
                const name = product.split("(")[0].trim();
                if (!reactantMap.has(name)) {
                    normalizedProducts.push(product);  // synthesized
                    normalizedReactants.push(product);
                    reactantDelimiters.push(reactantDelimMap[name] ?? "+");
                    productDelimiters.push(productDelimMap[name] ?? "+");
                }
            }
        }

        complex_changes = compareDelimiterLists(reactantDelimiters, productDelimiters, arrow);

        fullReactionString = normalizedReactants.join(".");

        if (complex_changes && complex_changes.length > 3 && productParts.length ===1) {
            complex_changes.splice(complex_changes.length - 2, 1);
        }

        if (hasDuplicateOnBothSides) {
            dup_synthesized = [];
            if (productParts.length > reactantParts.length) {
                for (let i = 0; i < normalizedProducts.length; i++) {
                    const before = productDelimiters[i - 1];
                    const after = productDelimiters[i];

                    const isIsolatedPlus = (before !== "." && after !== ".");

                    if (isIsolatedPlus) {
                        dup_synthesized.push({
                            name: normalizedProducts[i].split("(")[0].trim(),
                            full: normalizedProducts[i],
                            index: i
                        });
                    }
                }
          }
        }
        synth_deg_changesDict = {
                dup_synthesized: dup_synthesized,
                dup_degraded: dup_degraded,
                synthesized: synthesized,
                degraded: degraded,
                fullReactionString: fullReactionString
        }

        // After normalization, proceed with standard site/bond change detection
        reactantParts = normalizedReactants;
        productParts = normalizedProducts;   

        const reactantSiteTracker = {};
        for (const part of reactantParts) {
            const molName = part.split("(")[0].trim();
            if (!degraded.includes(molName)) continue;

            const siteBlock = part.match(/\((.*?)\)/)?.[1];
            if (!siteBlock) continue;

            const sites = siteBlock.split(",");
            rmolCounter[molName] = (rmolCounter[molName] || 0) + 1;
            const molLabel = `${molName} #${rmolCounter[molName]}`;

            if (!reactantSiteTracker[molLabel]) {
                reactantSiteTracker[molLabel] = {};
            }

            for (const site of sites) {
                const bondMatch = site.match(/!(\d+)/);
                if (bondMatch) {
                    const siteName = site.split("~")[0].split("!")[0];
                    const index = reactantSiteTracker[molLabel][siteName] || 0;

                    const siteKey = duplicateSiteTrackers[molName]?.[siteName]
                        ? `${molLabel}:${siteName}[${index}]`
                        : `${molLabel}:${siteName}`;

                    changesDict[siteKey] = {
                        molecule: molLabel,
                        site: siteName,
                        reactant: site,
                        product: site.split("!")[0] + "!-",
                        change: [bondRemovedNonRev],
                    };
                    reactantSiteTracker[molLabel][siteName] = index + 1;
                }
            }
        }
    }
    
    rmolCounter = {};
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

    if (!allRsites || !allPsites || allRsites.length !== allPsites.length) {
    console.error("Skipping reaction comparison due to mismatched reactants and products.", 
                  "Reactants:", allRsites, "Products:", allPsites);
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

    let useThisComplexChanges;   
    if (synth_deg_changesDict.fullReactionString) {
        useThisComplexChanges = complex_changes;
    } else {
        useThisComplexChanges = complexChanges;
    }

    return {
        changes: changesDict,
        complexChanges: useThisComplexChanges, // return + . changes
        synth_deg_changes: synth_deg_changesDict,
        outputErrors: output 
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