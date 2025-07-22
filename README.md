# Overview

This package is designed to convert BioNetGen Language (BNGL) strings into visual railroad diagrams to represent biological networks and reaction mechanisms. The `bngl_parser.js` module preprocesses strings from BNGL code files. `expanded.js` returns fully expanded BNGL strings and `compare_reactions.js` finds differences between reactants and products in a BNGL reaction rule. `Molecules_BNGL_to_Python.js` is designed to take these parsed BNGL strings and translate them into formatted diagram code to be drawn by railroad diagram classes. `railroad2.js` is a railroad-diagram renderer that reads the diagram code and generates the SVG railroad visualization. These diagrams show molecular interactions by highlighting sites, states, bonds, and changes through reactions. 

## bngl_parser.js
- Parses BNGL files line by line to extract sections such as molecule types, species, observables, and reaction rules.
- Cleans BNGL code to ensure proper formatting by stripping comments, extra whitespace, trailing functions or parameters, and malformed lines.
- Standardizes code by merging multiline expressions and fixing malformed molecule patterns that lack parentheses.
- Sends the cleaned BNGL strings to `expanded.js` to fully expand molecule/site definitions and `compare_reactions.js` to detect and return changes across reactions.
- Passes expanded BNGL strings and dictionary with reaction changes to bnglToRailroad function in `Molecules_BNGL_to_Python.js` for conversion.

## expanded.js
Expands shortened molecule patterns, as in observables and reaction rules, into their full forms using molSiteDict, which stores all molecules in a given BNGL file and their sites/states.
- Input: a BNGL string and a molecule-site dictionary (molSiteDict)
- Functions: 
  - Fills in missing sites, states, and bond arguments when only partial information is given.
  - Resolves inconsistent ordering of sites within a molecule to match with original order in molecule type definition
  - Properly handles and expands sites with the same name.
- Output: returns a fully "expanded" BNGL string for accurate visualization and comparison.

Example: EGFR(tmd!+,y1068\~u) returns EGFR(ecd!?,tmd!+,y1068\~u!-,y1173\~u\~p!?) given the molecule EGFR(ecd,tmd,y1068\~u\~p,y1173\~u\~p)

## compare_reactions.js
Detects bond and state changes between reactants and products and stores the changes in a dictionary to display a reaction rule in a single diagram.
- Input: expanded versions of reactant and product strings, the reaction arrow (either -> or <->), and molecule-site dictionary (molSiteDict)
- compareReactions Functions:
  - Analyzes differences between the expanded left-hand side (reactants) and the expanded right-hand side (products) of a reaction rule.
  - Tracks changes like bond addition, bond breakage, state transitions, the type of reaction (reversible or nonreversible), and their respective molecules, sites, and states.
  - Stores changes with notes like:
    - "radded" / "nradded" (bond added)
    - "rbroken" / "nrbroken" (bond broken)
    - "change from bottom state to top state" / "change from top state to bottom state"
- Output: a changesDict that matches molecules, sites, and states to the type of change they undergo.
```javascript
changesDict[siteKey] = {
                molecule: rmol,
                site: rsite,
                reactant: rRaw,
                product: pRaw,
                change: change,
            };
```
- compareComplexSeparation Functions:
  - Goes through expanded reactants and expanded products, and stores the order of separators (either + for molecules in separate complexes or . for molecules in the same complex)
  - Analyzes differences between the orders of separators and stores each comparison in a list:
    - "NoChangeComplex" / "NoChangeSeparate" (no association/dissociation)
    - "NonRevChangeComplex" / "NonRevChangeSeparate" (nonreversible association/dissociation)
    - "RevChangeComplex" / "RevChangeSeparate" (reversible association/dissociation)
- Output: a list with all changes that will be inserted between each molecule in a diagram.

## Molecules_BNGL_to_Python.js

Breaks BNGL string into components to write diagram code that includes molecules, sites, states, bonds, and changes from reactions (e.g., state transitions or binding/unbinding). Inserts diagram elements (e.g., Choice, Sequence, Terminal), applies notes for state or bond changes, and returns a string of JavaScript code for rendering by `railroad2.js`:
```javascript
"new Choice(0, new Comment(\"    \"), new Sequence(new Terminal(\"y1068\", { box_color: \"lightblue\" }"
```

### Key Parameters:

- `bnglString` (String): The BNGL-formatted input string representing molecules and their interactions.
- `displayString` (String, optional): Alternative display label for the diagram; defaults to `null`.
- `changesDict` (Object, optional): Dictionary indicating changes such as bonds formed/broken and state transitions. Default is `null`.
- `molSiteDict` (Object, optional): Dictionary containing molecule-specific site information; default is an empty object `{}`.
- `arrow` (String, optional): Symbol representing reversible or nonreversible reaction changes (e.g., -> or <->).
- `complexChanges` (Array, optional): Array indicating whether molecules remain in the same complex or switch (e.g., dissociation or reassociation). Default is `null`

### Diagram Elements:
The generated railroad diagrams visually represent BNGL components using customizable color-coded elements:
```javascript
const MoleculeColor = 'lightgreen';
const SiteColor = 'lightblue';
const StateColor = 'khaki';
```
- **Molecules**: Colored rounded-boxes labeled with molecule names.
- **Sites**: Colored rounded-boxes representing specific binding sites within molecules.
- **States**: Colored boxes indicating specific states of sites (e.g., ~P, ~Y).

**Reaction Changes**: Indicators for molecular changes as a result of reactions, including:
```javascript
const stateChangeUp = "change from bottom state to top state";
const stateChangeDown = "change from top state to bottom state";
const bondAddedNonRev = "nradded";
const bondRemovedNonRev = "nrbroken";
const bondAddedRev = "radded";
const bondRemovedRev = "rbroken";
const bindAndStateChange = "bind_and_state_change";
```
  - State changes (transition from one state to another)
  - Non-reversible bonds (nradded, nrbroken)
  - Reversible bonds (radded, rbroken)
  - Combined state and bond changes (bind_and_state_change)

**Complex Changes**: Indicators for changes between molecules in the same VS separate complex
```javascript
const NoChangeComplex = "NoChangeComplex";
const NoChangeSeparate = "NoChangeSeparate";
const NonRevChangeComplex = "NonRevChangeComplex";
const NonRevChangeSeparate = "NonRevChangeSeparate";
const RevChangeComplex = "RevChangeComplex";
const RevChangeSeparate = "RevChangeSeparate";
```
  - Molecules stay in their original (separate or same) complex (NoChangeComplex, NoChangeSeparate)
  - Non-reversible switch between same/separate complex (NonRevChangeComplex, NonRevChangeSeparate)
  - Reversible switch between same/separate complex (RevChangeComplex, RevChangeSeparate)

## railroad2.js
This module is a customized SVG-based renderer that defines layout classes to read the formatted diagram code and draw the related railroad diagram showing molecule and site structure, bond connectivity, binding/unbinding and state transitions, complex changes, and other styling components.

### Components
Diagram()
* Its arguments are the components of the diagram (e.g., Diagram(Choice(), Terminal())...)

`Terminal(text[, {box_color, bottom_bind, bottom_bind_color, bond_num, bond_type, wrap}])`
* All the properties in the options bag are optional
* `box_color` specifies the color to fill the container
* `bottom_bind` specifies possible bond connection (e.g, "!?" or "!+")
* `bottom_bind_color` passes the color of the bond connection (e.g., "gray")
* `bond_num` passes the bond argument (e.g., "?", "+", "4")
* `bond_type` specifies a bond change (e.g., "radded")
* `wrap` specifies if the bond wrap around all states

`NonTerminal(text[, {box_color, bottom_bind, bottom_bind_color, bond_num, bond_type, wrap}])`
  * The optional arguments have the same meaning as for Terminal,
    except it visualizes as a rectangular box rather than a rounded-rectangle

`Skip()` - an empty line

`Comment(text[, {href, title, cls}])` - a comment.
* `href` makes the text a hyperlink with the given URL
* `title` adds an SVG `<title>` element to the element, giving it "hover text" and a description for screen-readers and other assistive tech
* `cls` is additional classes to apply to the element, beyond the default

`Start({type, label})` and `End({type})` - the start/end shapes. 
* Shapes are supplied by default.
* All properties are optional.
* `type` takes either "simple" (the default) or `"complex"` for slightly different start/end shapes
* `label` provides a text label before the diagram starts

`EndWhiteSpace(changeType, type)` - separator between molecules
* All properties are optional.
* `changeType` specifies a switch between molecules in the same complex or separate complexes
* `type` argument has the same meaning as for Start and End.

### Containers
`Sequence(...children)` - Arranges all arguments on the same horizontal line, one after another.

`Choice(index, ...children)` - Arranges arguments on different vertical levels to represent mutually exclusive options. The index specifies the default (middle) choice.

`MultipleChoice(index, type, arrow, ...children)` - it's similar to Choice, but used to show state changes.
* `index` specifies the default middle choice.
* `type` specifies whether the state changes from a top state to a bottom state or vice versa.
* `arrow` is either -> or <-> to specify whether the transition is reversible or non-reversible
