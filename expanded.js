function hasDuplicateSiteNames(sites) {
        const seen = new Set();
        for (const s of sites) {
            const base = s.split('~')[0].split('!')[0];
            if (seen.has(base)) return true;
            seen.add(base);
        }
        return false;
    }

function expandExpr(bnglExpr, molSiteDict) {

    const chunks = bnglExpr.split('.');
    const expandedChunks = [];

    for (let chunk of chunks) {
        chunk = chunk.trim();

        if (chunk.includes('(') && chunk.includes(')')) {
            const molEndIdx = chunk.indexOf('(');
            const exprEndIdx = chunk.indexOf(')');
            const molName = chunk.slice(0, molEndIdx);
            const inside = chunk.slice(molEndIdx + 1, exprEndIdx);

            const molSites = molSiteDict[molName] || [];
            const inputSites = inside.split(',').map(s => s.trim()).filter(Boolean);
            const usePosition = hasDuplicateSiteNames(molSites);

            const allSites = [];
            if (usePosition) {
                for (let i = 0; i < molSites.length; i++) {
                    let s = inputSites[i];
                    if (s !== undefined) {
                        if (!s.includes('!')) s += '!-';
                        allSites.push(s);
                    } else {
                        allSites.push(molSites[i] + '!?');
                    }
            }
            } else {
                const givenSites = {};
                for (let s of inside.split(',')) {
                    s = s.trim();
                    const sBase = s.split('~')[0].split('!')[0];
                    givenSites[sBase] = s;
                }

                const sites = molSiteDict[molName] || [];
                for (let site of sites) {
                    const base = site.split('~')[0].split('!')[0];
                    if (base in givenSites) {
                        let s = givenSites[base];
                        if (!s.includes('!')) {
                            s += '!-';
                        }
                        allSites.push(s);
                    } else {
                        allSites.push(site + '!?');
                    }
                }
            }
            const updatedInside = allSites.join(',');
            expandedChunks.push(`${molName}(${updatedInside})`);

        } else if (molSiteDict.hasOwnProperty(chunk)) {
            const inside = molSiteDict[chunk].map(s => `${s}!?`).join(',');
            expandedChunks.push(`${chunk}(${inside})`);
        } else {
            expandedChunks.push(chunk);
        }
    }

    return expandedChunks.join('.');
}
export { expandExpr };