// bngl_parser.js
import { expandExpr } from './expanded.js';
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
    for (let line of lines) {
        if (line.startsWith('#') || !line) continue;
        if (!line.includes('(')) {
            line = MalformedMolecules(line);
        }
        const match = line.match(/(\w+)\((.*?)\)/);
        if (!match) continue;
        const [_, mol, sitesBlock] = match;
        const sites = sitesBlock.split(',').map(s => s.trim()).filter(Boolean);
        dict[mol] = sites;
    }
    return dict;
}

function MalformedMolecules(line) {
    line = line.split(/\s+/)[0].trim();
    const newline = line + '()';
    return newline;
}

function stripAfterLastValidMolecule(fullStr, molSiteDict) {
    let lastValidCloseIdx = -1;

    // Regular expression to find every (...) and the name before it
    const regex = /([A-Za-z_][\w]*)\s*\(([^()]*)\)/g;
    let match;

    while ((match = regex.exec(fullStr)) !== null) {
        const [wholeMatch, molName] = match;
        const closeIdx = regex.lastIndex;  // index right after the closing ')'

        if (molSiteDict.hasOwnProperty(molName)) {
            lastValidCloseIdx = closeIdx;  // store the last valid molecule’s closing paren index
        }
    }

    // If valid molecule found, slice up to its closing ')'
    if (lastValidCloseIdx !== -1) {
        return fullStr.slice(0, lastValidCloseIdx);
    }
    return fullStr;  // fallback: return original
}

export async function parseBNGLFile(fileText, useBNGL, showComments, showBNGLString, showMolecules, showBondIndices, displayFunctions) {
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
        return (start !== -1 && end !== -1)
            ? { lines: lines.slice(start + 1, end), start, end }
            : { lines: [], start: -1, end: -1 };
    };

    let blocks_index_start = {};
    blocks_index_start["functions"] = getBlockFlexible(["begin functions"], ["end functions"]).start;
    blocks_index_start["molecule"] = getBlockFlexible(["begin molecule"], ["end molecule"]).start;
    blocks_index_start["species"] = getBlockFlexible(["begin species", "begin seed species"], ["end species", "end seed species"]).start;
    blocks_index_start["observables"] = getBlockFlexible(["begin observables"], ["end observables"]).start;
    blocks_index_start["reaction"] = getBlockFlexible(["begin reaction"], ["end reaction"]).start;

    let blocks_index_end = {};
    blocks_index_end["functions"] = getBlockFlexible(["begin functions"], ["end functions"]).end;
    blocks_index_end["molecule"] = getBlockFlexible(["begin molecule"], ["end molecule"]).end;
    blocks_index_end["species"] = getBlockFlexible(["begin species", "begin seed species"], ["end species", "end seed species"]).end;
    blocks_index_end["observables"] = getBlockFlexible(["begin observables"], ["end observables"]).end;
    blocks_index_end["reaction"] = getBlockFlexible(["begin reaction"], ["end reaction"]).end;

    let lastComment = null

    for (let i = 0; i < blocks_index_start["functions"]; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
        }


    if (displayFunctions) {
        const functionLines = getBlockFlexible(["begin functions"], ["end functions"]).lines;
        const functionsLabel = useBNGL ? "Functions" : "Functions";
        if (functionLines.length > 0) { 
        output.push(
        'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("h2"), { textContent: "${functionsLabel}" })` +
        ');'
        );
        for (let line of functionLines) {
                if (!line) continue;

                if (line.startsWith('#')) {
                    lastComment = line.slice(1).trim();
                    if (showComments) {
                        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                        output.push(
                        'document.getElementById("diagramArea").appendChild(' +
                            `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(lastComment)} })` +
                        ');');
                    }
                    continue;
                }
                if (line.includes('#')) {
                    line = line.split('#')[0].trim();
                }
                if (!line) continue;
            if (!line.startsWith('#')) {
                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                output.push(
                'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
                ');');
            }
        }
    }
}

    if (!blocks_index_end["functions"]) {
        blocks_index_end["functions"] = -1;
    }

    for (let i = blocks_index_end["functions"] + 1; i < blocks_index_start["molecule"]; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
    }


    const moleculeLines = getBlockFlexible(["begin molecule types", "begin molecule"], ["end molecule types", "end molecule"]).lines;
    const molSiteDict = moleculeSiteDict(moleculeLines);
    if (moleculeLines.length >0) {
    const moleculesLabel = useBNGL ? "Molecules" : "Interacting Agents";
    output.push(
    'document.getElementById("diagramArea").appendChild(' +
        `Object.assign(document.createElement("h2"), { textContent: "${moleculesLabel}" })` +
    ');'
    );
    for (let line of moleculeLines) {
            if (!line) continue;

            if (line.startsWith('#')) {
                lastComment = line.slice(1).trim();
                if (showComments) {
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(lastComment)} })` +
                    ');');
                }
                continue;
            }
            if (line.includes('#')) {
                line = line.split('#')[0].trim();
            }
            if (!line) continue;
        if (!line.startsWith('#')) {
            if (!line.includes('(')) {
                line = MalformedMolecules(line);
            }
            output.push(bnglToRailroad(line, null, null, molSiteDict, showBNGLString, showMolecules, showBondIndices, null, null));
        }
    }
    } else {
        console.warn("No Molecules Block");
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No Molecules Block")} })` +
            ');'
            );
    }


    for (let i = blocks_index_end["molecule"] + 1; i < blocks_index_start["species"]; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
    }


    const speciesLines = getBlockFlexible(["begin species", "begin seed species"], ["end species", "end seed species"]).lines;
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
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(lastComment)} })` +
                    ');');
                }
                continue;
            }
            let parts = line.split(/\s+/);
            for (let part of parts) {
                if (part.includes(':')) part = part.split(':')[1];
                if (!part.includes('(')) {
                if (molSiteDict.hasOwnProperty(part)) {
                    part = MalformedMolecules(part).split(/\s+/);
                } else {
                    console.warn("No relevant molecule exists " + part);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant molecule exists: " + part)} })` +
                    ');'
                    );
                    continue;
                }
            }
            }
            let species = parts.find(p => p.includes('(') && p.includes(')')) || '';
            if (species.includes(':')) species = species.split(':')[1];
            
            if (species) {
                if (!molSiteDict.hasOwnProperty(species.split('(')[0])) {
                    console.warn("No relevant molecule exists " + species.split('(')[0]);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant molecule exists: " + species.split('(')[0])} })` +
                    ');'
                    );
                    continue;
                }
            } else {
                console.warn("Invalid species. Species must be an instance of a molecule type");
                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                output.push(
                'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Invalid species. Species must be an instance of a molecule type: " + species)} })` +
                ');'
                );
                continue;
            }

            if (species) output.push(bnglToRailroad(species, null, null, molSiteDict, showBNGLString, showMolecules, showBondIndices, null, null));
        }
    } else {
        console.warn("No Species Block");
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No Species Block")} })` +
            ');'
            );
    }



    for (let i = blocks_index_end["species"] + 1; i < blocks_index_start["observables"]; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
    }

    const obsLines = getBlockFlexible(["begin observables"], ["end observables"]).lines;
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
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(lastComment)} })` +
                    ');');
                }
                continue;
            }
            if (/([=<>]=?|==)\s*\d+(\.\d+)?/.test(line)) continue;
            const parts = line.split(/\s+/);

            let expr = ' ';
            let display_obs;
            let name;
            if (parts.length === 1) {
                expr = parts[0];
            } else if (parts.length === 2) {
                expr = parts[1];
                name = parts[0];
            } else {
                expr = parts.slice(2).join(' ');
                name = parts[1];
            }

            if (expr.includes(':')) expr = expr.split(':')[1];
            if (expr.includes('#')) {
                expr = expr.split('#')[0].trim();
            }
            if (!expr.includes('(')) {
                if (molSiteDict.hasOwnProperty(expr)) {
                    expr = MalformedMolecules(expr);
                } else if (expr.includes('.')) {
                    const splitparts = expr.split('.').map(p => {
                        if (!p.includes('(')) {
                            if (molSiteDict.hasOwnProperty(p)) {
                                return MalformedMolecules(p);
                            } else {
                                console.warn("Unrecognized molecule: " + p);
                                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                                output.push(
                                'document.getElementById("diagramArea").appendChild(' +
                                `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Unrecognized molecule: " + p)} })` +
                                ');'
                                );
                            }
                        }
                        return p;
                    });
                    expr = splitparts.join('.');
                } else {
                    console.warn("Unrecognized molecule: " + expr);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Unrecognized molecule: " + expr)} })` +
                    ');'
                    );
                    continue;
                }
            } else {
                if (!molSiteDict.hasOwnProperty(expr.split('(')[0])) {
                    console.warn("Unrecognized molecule: " + expr);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Unrecognized molecule: " + expr)} })` +
                    ');'
                    );
                    continue;
                }
            }
            if (/\),\s*/.test(expr)) {
                const exprParts = expr.split(/\),\s*/).map(e => {
                    const trimmed = e.trim();
                    return trimmed.endsWith(')') ? trimmed : trimmed + ')';
                }).filter(e => e !== ')');
                for (const subExpr of exprParts) {
                    const trimmed = subExpr.trim();
                    display_obs = name+"\t" +subExpr;
                    const expanded = expandExpr(trimmed, molSiteDict);
                    output.push(bnglToRailroad(expanded, display_obs, null, molSiteDict, showBNGLString, showMolecules, showBondIndices, null, null));
                }
            } else {
            const expanded = expandExpr(expr, molSiteDict);
            display_obs = name+"\t" +expr;
            output.push(bnglToRailroad(expanded, display_obs, null, molSiteDict, showBNGLString, showMolecules, showBondIndices, null, null));
            }
        }
    } else {
        console.warn("No Observables Block");
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No Observables Block")} })` +
            ');'
            );
    }



    for (let i = blocks_index_end["observables"] + 1; i < blocks_index_start["reaction"]; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
    }

    const reactionLines = getBlockFlexible(["begin reaction"], ["end reaction"]).lines;
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
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("small"), { textContent: ${JSON.stringify(lastComment)} })` +
                    ');');
                }
                continue;
            }

            if (line && /^\d/.test(line)) {
                line = line.replace(/^\d+\s+/, '');
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
                console.warn("No reaction arrow; skipping line:", line);
                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No reaction arrow; skipping line " + line)} })` +
                    ');'
                    );
                continue;
            }

            const parts = line.split(arrow);
            let reactants_str = parts[0].trim();
            let products_str = parts[1].trim();

            let display_r = [];
            let r_display_str = "";
            let expandedLHS = "";
            const stripped_r = [];
            const reactants = reactants_str.split(/(?<!!)\+/);
            for (let part of reactants) {
                part = part.trim();
                if (!part.includes('(')) {
                    if (molSiteDict.hasOwnProperty(part)) {
                        part = MalformedMolecules(part);
                    } else {
                        console.warn("No relevant reactant molecule exists " + part);
                        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                        output.push(
                        'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant reactant molecule exists: " + part)} })` +
                        ');'
                        ); 
                        continue;
                    }
                }
                if (part.includes('.')) {
                    let splitparts = part.split('.').map(p => {
                        if (!p.includes('(')) {
                            if (molSiteDict.hasOwnProperty(p)) {
                                const fixed = MalformedMolecules(p);
                                return fixed;
                            } else {
                                console.warn("Unrecognized reactant molecule: " + p);
                                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                                output.push(
                                'document.getElementById("diagramArea").appendChild(' +
                                `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Unrecognized reactant molecule: " + p)} })` +
                                ');'
                                );
                            }
                        }
                        return p;
                    });
                    part = splitparts.join('.');
                }
                const endIdx = part.lastIndexOf(")");
                if (endIdx !== -1) {
                    part = part.slice(0, endIdx + 1);
                }
                if (part.includes(':')) {
                    part = part.split(':')[1];
                }
                if (!molSiteDict.hasOwnProperty(part.split("(")[0])) {
                    console.warn("No relevant molecule exists " + part);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant reactant molecule exists: " + part)} })` +
                    ');'
                    );
                    continue;
                }
                display_r.push(part);
                expandedLHS = expandExpr(part, molSiteDict);
                stripped_r.push(expandedLHS);
            }
            reactants_str = stripped_r.join(' + ');
            r_display_str = display_r.join(' + ');

            // Remove rate expressions with * or /
            const multPattern = /\s+[a-zA-Z_]\w*\s*\*\s*[a-zA-Z_]\w+.*$/;
            if (multPattern.test(products_str)) {
                products_str = products_str.split(multPattern)[0].trim();
            }
            const slashPattern = /\s*[a-zA-Z_]\w*\/[a-zA-Z_]\w+/;
            if (slashPattern.test(products_str)) {
                products_str = products_str.split(slashPattern)[0].trim();
            }
            // Remove rate expressions with +
            const addPattern = /\b[a-zA-Z_]\w*\b\s*\+\s*\b[a-zA-Z_]\w*\b\s*\*\s*\b[a-zA-Z_]\w*\b/;
            if (addPattern.test(products_str)) {
                products_str = products_str.split(addPattern)[0].trim();
            }
            // Remove rate expressions with parentheses
            const ratePattern = /\(+[\w.]+\s*\*\s*[\w.]+/;
            if (ratePattern.test(products_str)) {
                products_str = products_str.split(ratePattern)[0].trim();
            }

            let display_p = [];
            let p_display_str = "";
            let expandedRHS = "";
            const stripped_p = [];
            const products = products_str.split(/(?<!!)\+/);
            for (let part of products) {
                part = part.trim();
                if (!part.includes('(')) {
                    part = part.split(/\s+/)[0].trim();
                    if (molSiteDict.hasOwnProperty(part)) {
                        part = MalformedMolecules(part);
                    } else {
                        console.warn("No relevant product molecule exists " + part);
                        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                        output.push(
                        'document.getElementById("diagramArea").appendChild(' +
                        `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant product molecule exists: " + part)} })` +
                        ');'
                        ); 
                        continue;
                    }
                }
                if (part.includes('.')) {
                    let splitparts = part.split('.').map(p => {
                        if (!p.includes('(')) {
                            p = p.split(/\s+/)[0].trim();
                            if (molSiteDict.hasOwnProperty(p)) {
                                const fixed = MalformedMolecules(p);
                                return fixed;
                            } else {
                                console.warn("Unrecognized product molecule: ", p);
                                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                                output.push(
                                'document.getElementById("diagramArea").appendChild(' +
                                `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Unrecognized product molecule: " + p)} })` +
                                ');'
                                );
                            }
                        }
                        return p;
                    });
                    part = splitparts.join('.');
                }
                const endIdx = part.lastIndexOf(")");
                if (endIdx !== -1) {
                    const moleculeName = part.slice(0, part.indexOf('(')).trim();
                    if (molSiteDict.hasOwnProperty(moleculeName)) {
                        part = part.slice(0, endIdx + 1);
                    }
                }
                part = stripAfterLastValidMolecule(part, molSiteDict);
                if (part.includes(':')) {
                    part = part.split(':')[1];
                }
                if (!molSiteDict.hasOwnProperty(part.split("(")[0])) {
                    console.warn("No relevant molecule exists " + part);
                    output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                    output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No relevant molecule exists: " + part)} })` +
                    ');'
                    );
                    continue;
                }
                display_p.push(part);
                expandedRHS = expandExpr(part, molSiteDict);
                stripped_p.push(expandedRHS);
            }
            products_str = stripped_p.join(' + ');
            products_str = stripAfterLastValidMolecule(products_str, molSiteDict);
            p_display_str = display_p.join(' + ');
            p_display_str = stripAfterLastValidMolecule(p_display_str, molSiteDict);

            let arrow_and_products = arrow + products_str;
            if (arrow_and_products.includes("-> 0") || arrow_and_products.includes("->0")) {
                products_str = "0"
                p_display_str = "0"
            }

            let synth_0 = false;
            let deg_0 = false;
            if (!products_str.includes('(') || !reactants_str.includes('(')) {
                if (!r_display_str) {
                    r_display_str = "0"
                    reactants_str = "0"
                }
                if (products_str === "0") {
                    deg_0 = true;
                }
                if (reactants_str === "0") {
                    synth_0 = true;
                }
            }

            if ((!products_str.includes('(') || !reactants_str.includes('(')) && (!synth_0&&!deg_0)) {
                console.warn("⚠️ Skipping malformed reaction:", r_display_str, arrow, p_display_str);
                output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
                output.push(
                'document.getElementById("diagramArea").appendChild(' +
                `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ Skipping malformed reaction: " + r_display_str + " " + arrow + " " + p_display_str)} })` +
                ');'
                );
                continue;
            }

            const display = `${r_display_str} ${arrow} ${p_display_str}`;
            const {changes, complexChanges, synth_deg_changes, outputErrors} = compareReactions(reactants_str, products_str, arrow, molSiteDict);
            if (outputErrors) {
            output.push(outputErrors.join('\n'));}

            if (synth_deg_changes && changes) {
            if (synth_deg_changes.fullReactionString) {
                reactants_str = synth_deg_changes.fullReactionString;
            } else {
                reactants_str = reactants_str.replace(/ \+ /g, '.');
            }
            output.push(bnglToRailroad(reactants_str, display, changes, molSiteDict, showBNGLString, showMolecules, showBondIndices, arrow, complexChanges, synth_deg_changes));} 
    
            else {if (changes) {
            reactants_str = reactants_str.replace(/ \+ /g, '.');
            output.push(bnglToRailroad(reactants_str, display, changes, molSiteDict, showBNGLString, showMolecules, showBondIndices, arrow, complexChanges, null));} 

            if (synth_deg_changes) {
            reactants_str = synth_deg_changes.fullReactionString;
            output.push(bnglToRailroad(reactants_str, display, null, molSiteDict, showBNGLString, showMolecules, showBondIndices, arrow, complexChanges, synth_deg_changes));} 
            }
        }
    } else {
        console.warn("No Reaction Rules Block");
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
                    'document.getElementById("diagramArea").appendChild(' +
                    `Object.assign(document.createElement("alert"), { textContent: ${JSON.stringify("⚠️ No Reaction Rules Block")} })` +
                    ');'
                    );
    }


    for (let i = blocks_index_end["reaction"] + 1; i < lines.length; i++) {
        const line = lines[i];
        output.push('document.getElementById("diagramArea").appendChild(document.createElement("br"));');
        output.push(
            'document.getElementById("diagramArea").appendChild(' +
            `Object.assign(document.createElement("medium"), { textContent: "\\n" + ${JSON.stringify(line)} })` +
            ');'
        );
    }

    return output.join('\n');
}
