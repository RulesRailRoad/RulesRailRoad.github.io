// Define changes
const stateChangeUp = "change from bottom state to top state";
const stateChangeDown = "change from top state to bottom state";

const bondAddedNonRev = "nradded";
const bondRemovedNonRev = "nrbroken";
const bondAddedRev = "radded";
const bondRemovedRev = "rbroken";
const bindAndStateChange = "bind_and_state_change";



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

            changesDict[`${rmol}:${rsite}`] = {
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