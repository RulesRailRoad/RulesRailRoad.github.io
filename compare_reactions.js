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

// function to compare + and . changes in reactions
function compareComplexSeparation(expandedReactants, expandedProducts, arrow) { 
    // extract delimiter order
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

    const changes = []
    const reactantOrder = extractGroupOrder(expandedReactants);
    const productOrder = extractGroupOrder(expandedProducts);

    if (reactantOrder.length !== productOrder.length) {
        console.warn("Mismatched reaction order — skipping reaction comparison.");
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
    const complexChanges = compareComplexSeparation(expandedReactants, expandedProducts, arrow, molSiteDict);

    expandedReactants = expandedReactants.replace(/ \+ /g, '.')
    expandedProducts = expandedProducts.replace(/ \+ /g, '.');
    const changesDict = {};
    const rmolCounter = {};
    const pmolCounter = {};

    const reactantParts = expandedReactants.split(".");
    const productParts = expandedProducts.split(".");

    // Check if the molecule order matches
    const reactantOrder = reactantParts.map(p => p.trim().split("(")[0]);
    const productOrder = productParts.map(p => p.trim().split("(")[0]);

    if (reactantOrder.join(",") !== productOrder.join(",")) {
        console.warn("Molecule order mismatch — skipping reaction:", "reactants:", reactantOrder,
            "products:", productOrder);
        return { changes: null, complexChanges: null }; // return + . changes
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