// bngl_parser.js
import { expandExpr } from './_expanded.js';
import { compareReactions, stateChangeUp, stateChangeDown, bondAddedNonRev, bondRemovedNonRev, bondAddedRev, bondRemovedRev } from './compare_reactions.js';
import { bnglToRailroad } from './Molecules_BNGL_to_Python.js';

const MoleculeColor = 'lightgreen';
const SiteColor = 'lightblue';
const StateColor = 'khaki';

export function joinLines(lines) {
    const joined = [];
    let current = '';
    for (let line of lines) {
        line = line.trim();
        if (line.endsWith('\\')) {
            current += line.slice(0, -1) + ' ';
        } else {
            current += line;
            joined.push(current);
            current = '';
        }
    }
    if (current) joined.push(current);
    return joined;
}

export function moleculeSiteDict(lines) {
    const dict = {};
    for (const line of lines) {
        if (line.startsWith('#') || !line.includes('(')) continue;
        const match = line.match(/(\w+)\((.*?)\)/);
        if (!match) continue;
        const [_, mol, sitesBlock] = match;
        const sites = sitesBlock.split(',').map(s => s.trim()).filter(Boolean);
        dict[mol] = sites;
    }
    return dict;
}

export async function parseBNGLFile(fileText, useBNGL, showComments) {
    const lines = joinLines(fileText.split(/\r?\n/).map(l => l.trim()));
    const output = [];

    const getBlockFlexible = (startTokens, endTokens) => {
        let start = -1, end = -1;
        for (let i = 0; i < lines.length; i++) {
            for (const token of startTokens) {
                if (lines[i].toLowerCase().startsWith(token)) {
                    start = i;
                    break;
                }
            }
            if (start !== -1) break;
        }
        for (let i = start + 1; i < lines.length; i++) {
            for (const token of endTokens) {
                if (lines[i].toLowerCase().startsWith(token)) {
                    end = i;
                    break;
                }
            }
            if (end !== -1) break;
        }
        return start !== -1 && end !== -1 ? lines.slice(start + 1, end) : [];
    };

    let lastComment = null

    const moleculeLines = getBlockFlexible(["begin molecule types", "begin molecules"], ["end molecule types", "end molecules"]);
    const molSiteDict = moleculeSiteDict(moleculeLines);
    const moleculesLabel = useBNGL ? "Molecules" : "Interacting Agents";
    output.push(
    'document.getElementById("diagramArea").appendChild(' +
        `Object.assign(document.createElement("h2"), { textContent: "${moleculesLabel}" })` +
    ');'
    );
    for (const line of moleculeLines) {
            if (!line) continue;

            if (line.startsWith('#')) {
                lastComment = line.slice(1).trim();
                if (showComments) {
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("h4"), { textContent: "${lastComment}" })` +
                    ');');
                }
                continue;
            }
        if (!line.startsWith('#')) {
            output.push(bnglToRailroad(line, null, null, molSiteDict, useBNGL));
        }
    }

    const speciesLines = getBlockFlexible(["begin species", "begin seed species"], ["end species", "end seed species"]);
    if (speciesLines.length > 0) {
        const speciesLabel = useBNGL ? "Species" : "Initial Set of the Systems";
        output.push(
        'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("h2"), { textContent: "${speciesLabel}" })` +
        ');'
        );
        for (const line of speciesLines) {
            if (!line) continue;

            if (line.startsWith('#')) {
                lastComment = line.slice(1).trim();
                if (showComments) {
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("h4"), { textContent: "${lastComment}" })` +
                    ');');
                }
                continue;
            }
            const parts = line.split(/\s+/);
            let species = parts.find(p => p.includes('(') && p.includes(')')) || '';
            if (species.includes(':')) species = species.split(':')[1];
            if (species) output.push(bnglToRailroad(species, null, null, molSiteDict, useBNGL));
        }
    }

    const obsLines = getBlockFlexible(["begin observables"], ["end observables"]);
    if (obsLines.length > 0) {
        output.push(
        'document.getElementById("diagramArea").appendChild(' +
            'Object.assign(document.createElement("h2"), { textContent: "Observables" })' +
        ');'
        );
        for (const line of obsLines) {
            if (!line) continue;

            if (line.startsWith('#')) {
                lastComment = line.slice(1).trim();
                if (showComments) {
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("h4"), { textContent: "${lastComment}" })` +
                    ');');
                }
                continue;
            }
            const parts = line.split(/\s+/);
            let expr = parts.slice(2).join(' ');
            if (expr.includes(':')) expr = expr.split(':')[1];
            const expanded = expandExpr(expr, molSiteDict);
            output.push(bnglToRailroad(expanded, expr, null, molSiteDict, useBNGL));
        }
    }

    const reactionLines = getBlockFlexible(["begin reaction"], ["end reaction"]);
    if (reactionLines.length > 0) {
        const reactionsLabel = useBNGL ? "Reaction Rules" : "Rules of Interactions";
        output.push(
        'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("h2"), { textContent: "${reactionsLabel}" })` +
        ');'
        );
        for (let line of reactionLines) {
            if (!line) continue;

            if (line.startsWith('#')) {
                lastComment = line.slice(1).trim();
                if (showComments) {
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("h4"), { textContent: "${lastComment}" })` +
                    ');');
                }
                continue;
            }

            if (/^[^:\s]+:\s*/.test(line)) {
                line = line.replace(/^[^:\s]+:\s*/, '');
            }

            let arrow = null;
            if (line.includes('<->')) {
                arrow = '<->';
            } else if (line.includes('->')) {
                arrow = '->';
            } else {
                continue;
            }

            const parts = line.split(arrow);
            let reactants_str = parts[0].trim();
            let products_str = parts[1].trim();

            const stripped_r = [];
            const reactants = reactants_str.split(' + ');
            for (let part of reactants) {
                part = part.trim();
                const endIdx = part.lastIndexOf(")");
                if (endIdx !== -1) {
                    part = part.slice(0, endIdx + 1);
                }
                if (part.includes(':')) {
                    part = part.split(':')[1];
                }
                stripped_r.push(part);
            }
            reactants_str = stripped_r.join(' + ');

            const stripped_p = [];
            const products = products_str.split(' + ');
            for (let part of products) {
                part = part.trim();
                const endIdx = part.lastIndexOf(")");
                if (endIdx !== -1) {
                    part = part.slice(0, endIdx + 1);
                }
                if (part.includes(':')) {
                    part = part.split(':')[1];
                }
                stripped_p.push(part);
            }
            products_str = stripped_p.join(' + ');

            const expandedLHS = expandExpr(reactants_str.replace(/ \+ /g, '.'), molSiteDict);
            const expandedRHS = expandExpr(products_str.replace(/ \+ /g, '.'), molSiteDict);

            if (!expandedLHS.includes('(') || !expandedRHS.includes('(')) {
                console.warn("⚠️ Skipping malformed reaction:", reactants_str, '->', products_str);
                continue;
            }

            const display = `${reactants_str} ${arrow} ${products_str}`;
            const changes = compareReactions(expandedLHS, expandedRHS, arrow, molSiteDict);
            output.push(bnglToRailroad(expandedLHS, display, changes, molSiteDict, useBNGL));
        }
    }

    return output.join('\n');
}
