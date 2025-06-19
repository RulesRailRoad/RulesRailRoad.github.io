// Define changes
const stateChangeUp = "change from bottom state to top state";
const stateChangeDown = "change from top state to bottom state";

const bondAddedNonRev = "nradded";
const bondRemovedNonRev = "nrbroken";
const bondAddedRev = "radded";
const bondRemovedRev = "rbroken";
const bindAndStateChange = "bind_and_state_change";

function hasDuplicateSiteNames(sites) {
    const seen = new Set();
    for (const s of sites) {
        const base = s.split('~')[0].split('!')[0];
        if (seen.has(base)) return true;
        seen.add(base);
    }
    return false;
}


function compareReactions(expandedReactants, expandedProducts, arrow, molSiteDict) {
    const changesDict = {};
    const rmolCounter = {};
    const pmolCounter = {};

    const reactantParts = expandedReactants.split(".");
    const productParts = expandedProducts.split(".");

    const allRsites = [];
    for (const part of reactantParts) {
        const rmol = part.split("(")[0];
        const rsites = part.split("(")[1].slice(0, -1);  // remove trailing ")"
        const rsitesParts = rsites.split(",");

        rmolCounter[rmol] = (rmolCounter[rmol] || 0) + 1;
        const molLabel = `${rmol} #${rmolCounter[rmol]}`;

        for (const site of rsitesParts) {
            allRsites.push([molLabel, site]);
        }
    }

    const allPsites = [];
    for (const part of productParts) {
        const pmol = part.split("(")[0];
        const psites = part.split("(")[1].slice(0, -1);
        const psitesParts = psites.split(",");

        pmolCounter[pmol] = (pmolCounter[pmol] || 0) + 1;
        const molLabel = `${pmol} #${pmolCounter[pmol]}`;

        for (const site of psitesParts) {
            allPsites.push([molLabel, site]);
        }
    }

    // Determine which molecules have repeated site names
    const duplicateSiteTrackers = {};
    for (const mol of Object.keys(molSiteDict)) {
        duplicateSiteTrackers[mol] = hasDuplicateSiteNames(molSiteDict[mol] || []);
    }

    // Track indexes of each site name per molecule instance
    const siteInstanceIndex = {};

    for (let i = 0; i < allRsites.length; i++) {
        const [rmol, rRaw] = allRsites[i];
        const [pmol, pRaw] = allPsites[i];

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
                rbond !== pbond &&
                rsite === psite
            ) {
                change.push(bindAndStateChange);
            }

            let siteKey = `${rmol}:${rsite}`;
            const molBase = rmol.split(" #")[0];

            if (duplicateSiteTrackers[molBase]) {
                // Track individual site occurrence by molecule+site name
                const key = `${rmol}:${rsite}`;
                if (!(key in siteInstanceIndex)) {
                    siteInstanceIndex[key] = 0;
                }
                const index = siteInstanceIndex[key]++;
                siteKey = `${key}[${index}]`;
            }

            changesDict[siteKey] = {
                molecule: rmol,
                site: rsite,
                reactant: rRaw,
                product: pRaw,
                change: change
            };
        }
    }
    return changesDict;
}

export {
    compareReactions,
    stateChangeUp,
    stateChangeDown,
    bondAddedNonRev,
    bondRemovedNonRev,
    bondAddedRev,
    bondRemovedRev,
    bindAndStateChange
};